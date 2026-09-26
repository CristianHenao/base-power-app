"""Download reviewed EAGLE-I releases and stream validated Texas observations to Parquet.

Usage: python -m pipeline.pull_eaglei --years 2025 --dry-run
No DuckDB or running database service is required. SQLite is a temporary on-disk
duplicate index from the Python standard library; output is written with PyArrow.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sqlite3
import sys
import tempfile
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[1]
ARTICLE_ID = 24237376
PARSER_VERSION = "eaglei-observations-2"
REFERENCES = ("MCC.csv", "coverage_history.csv", "DQI.csv")
SCHEMA = pa.schema([
    ("county_fips", pa.string()), ("county_name", pa.string()),
    ("state_name", pa.string()), ("observed_at", pa.timestamp("us", tz="UTC")),
    ("customers_out", pa.int64()), ("observation_status", pa.string()),
])


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2, allow_nan=False) + "\n")


def checksums(path: Path) -> dict:
    sha, md5 = hashlib.sha256(), hashlib.md5(usedforsecurity=False)
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            sha.update(block)
            md5.update(block)
    return {"size_bytes": path.stat().st_size, "sha256": sha.hexdigest(), "md5": md5.hexdigest()}


def open_url(url: str):
    if not url.startswith("https://"):
        raise ValueError("Download URLs must use HTTPS")
    return urllib.request.urlopen(urllib.request.Request(
        url, headers={"User-Agent": "Porchlight-EAGLEI-ingest/1"},
    ), timeout=60)


def get_catalog(version: int) -> dict:
    with open_url(f"https://api.figshare.com/v2/articles/{ARTICLE_ID}/versions/{version}") as response:
        catalog = json.load(response)
    if catalog.get("id") != ARTICLE_ID or catalog.get("version") != version:
        raise ValueError("Figshare returned an unexpected article/version")
    return catalog


def select_files(catalog: dict, years: list[int]) -> list[dict]:
    selected = []
    for name in [*(f"eaglei_outages_{year}.csv" for year in years), *REFERENCES]:
        matches = [entry for entry in catalog["files"] if entry["name"] == name]
        if len(matches) != 1:
            raise ValueError(f"Expected exactly one {name} in the pinned Figshare release")
        selected.append(matches[0])
    return selected


def verify_download(path: Path, entry: dict) -> dict:
    actual = checksums(path)
    expected_md5 = entry.get("computed_md5") or entry.get("supplied_md5")
    if actual["size_bytes"] != entry["size"] or not expected_md5 or actual["md5"] != expected_md5:
        raise ValueError(f"Size/checksum mismatch for {entry['name']}; existing files are not overwritten")
    return actual


def download(entry: dict, directory: Path, version: int) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    name = entry["name"]
    if Path(name).name != name:
        raise ValueError("Unsafe filename in catalog")
    destination = directory / name
    manifest_path = directory / f"{name}.download.json"
    if destination.exists():
        digest = verify_download(destination, entry)
        print(f"Verified existing {name}", flush=True)
        # Preserve the original download timestamp when the existing manifest agrees.
        if manifest_path.exists():
            previous = json.loads(manifest_path.read_text())
            if previous.get("sha256") == digest["sha256"]:
                return destination
        downloaded_at = None
    else:
        for attempt in range(3):
            try:
                with tempfile.NamedTemporaryFile(dir=directory, prefix=f".{name}.", suffix=".part", delete=False) as temp:
                    partial = Path(temp.name)
                    with open_url(entry["download_url"]) as response:
                        copied = 0
                        next_notice = 256 * 1024 * 1024
                        while block := response.read(1024 * 1024):
                            temp.write(block)
                            copied += len(block)
                            if copied > entry["size"]:
                                raise ValueError("Download exceeds catalog file size")
                            if copied >= next_notice:
                                print(f"  {name}: {copied / 1e9:.2f}/{entry['size'] / 1e9:.2f} GB", flush=True)
                                next_notice += 256 * 1024 * 1024
                digest = verify_download(partial, entry)
                # Hard link publishes without replacing an existing user's raw file.
                destination.hardlink_to(partial)
                partial.unlink()
                break
            except Exception:
                if 'partial' in locals():
                    partial.unlink(missing_ok=True)
                if attempt == 2:
                    raise
                time.sleep(attempt + 1)
        downloaded_at = utc_now()
    write_json(manifest_path, {
        "article_id": ARTICLE_ID, "article_version": version, "file_id": entry["id"],
        "filename": name, "download_url": entry["download_url"],
        "downloaded_at": downloaded_at, "verified_at": utc_now(), **digest,
    })
    return destination


def parse_times(values: pd.Series) -> pd.Series:
    """Explicit reviewed ISO format, plus the alternate format documented in 2025 README."""
    parsed = pd.Series(pd.NaT, index=values.index, dtype="datetime64[ns, UTC]")
    formats = [
        (r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", "%Y-%m-%d %H:%M:%S"),
        (r"\d{1,2}/\d{1,2}/\d{2} \d{2}:\d{2}", "%m/%d/%y %H:%M"),
    ]
    for pattern, date_format in formats:
        mask = values.str.fullmatch(pattern)
        parsed.loc[mask] = pd.to_datetime(values.loc[mask], format=date_format, utc=True, errors="coerce")
    return parsed


def normalize(chunk: pd.DataFrame, year: int, count_column: str) -> tuple[pd.DataFrame, pd.Series]:
    text = chunk.apply(lambda column: column.str.strip())
    # Older exports can serialize an otherwise integral FIPS as 48085.0.
    fips = text.fips_code.str.replace(r"\.0$", "", regex=True).str.zfill(5)
    valid_fips = fips.str.fullmatch(r"\d{5}") & fips.str[:2].ne("00") & fips.str[2:].ne("000")
    observed = parse_times(text.run_start_time)
    counts = pd.to_numeric(text[count_column], errors="coerce")
    missing_counts = text[count_column].eq("")
    reasons = pd.Series("", index=chunk.index, dtype="string")
    checks = {
        "invalid_fips": valid_fips,
        "missing_county_or_state": text.county.ne("") & text.state.ne(""),
        # The 2025 file contains blanks and explicit zeros despite the README.
        # Only a truly empty/whitespace field is unknown; malformed text still fails.
        "invalid_customers_out": missing_counts | (
            counts.notna() & counts.ge(0) & counts.lt(2**63) & counts.mod(1).eq(0)
        ),
        "invalid_timestamp_or_year": observed.notna() & observed.dt.year.eq(year),
        "texas_state_fips_mismatch": fips.str.startswith("48").eq(text.state.eq("Texas")),
    }
    for name, valid in checks.items():
        reasons.loc[~valid.fillna(False)] += name + ";"
    clean = pd.DataFrame({
        "county_fips": fips, "county_name": text.county, "state_name": text.state,
        "observed_at": observed, "customers_out": counts,
        "observation_status": missing_counts.map({True: "missing_unknown", False: "reported"}),
    }).loc[reasons.eq("")].copy()
    clean["customers_out"] = clean.customers_out.astype("Int64")
    return clean, reasons


def unique_rows(connection: sqlite3.Connection, frame: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """Check duplicate keys across chunks without keeping all keys in RAM."""
    if frame.empty:
        return frame, 0
    frame = frame.reset_index(drop=True)
    batch = frame.copy()
    batch["observed_at"] = batch.observed_at.map(lambda value: value.isoformat())
    batch.to_sql("batch", connection, if_exists="replace", index=True, index_label="row_num")
    conflict = connection.execute("""
        SELECT county_fips, observed_at FROM batch GROUP BY county_fips, observed_at
        HAVING min(customers_out) != max(customers_out)
            OR (count(customers_out) > 0 AND count(customers_out) < count(*))
        UNION ALL
        SELECT b.county_fips, b.observed_at FROM batch b JOIN seen s
        USING (county_fips, observed_at) WHERE b.customers_out IS NOT s.customers_out
        LIMIT 1
    """).fetchone()
    if conflict:
        raise ValueError(f"Conflicting customer counts for county/timestamp {conflict}")
    new_indices = [row[0] for row in connection.execute("""
        SELECT min(b.row_num) FROM batch b LEFT JOIN seen s USING (county_fips, observed_at)
        WHERE s.county_fips IS NULL GROUP BY b.county_fips, b.observed_at
    """)]
    connection.execute("INSERT OR IGNORE INTO seen SELECT county_fips, observed_at, customers_out FROM batch")
    connection.commit()
    return frame.iloc[new_indices], len(frame) - len(new_indices)


def count_quality(frame: pd.DataFrame) -> dict[str, int]:
    return {
        "reported_positive": int(frame.customers_out.gt(0).sum()),
        "reported_zero": int(frame.customers_out.eq(0).sum()),
        "missing_unknown": int(frame.customers_out.isna().sum()),
    }


def add_counts(total: dict[str, int], counts: dict[str, int]) -> None:
    for key, value in counts.items():
        total[key] += value


def convert(source: Path, output_root: Path, year: int, *, counties: list[str] | None = None,
            chunk_size: int = 250_000, expected_rows: int | None = None) -> Path:
    destination = output_root / f"year={year}"
    if destination.exists():
        raise FileExistsError(f"{destination} already exists; choose a new --output-dir")
    output_root.mkdir(parents=True, exist_ok=True)
    report = {
        "status": "running", "parser_version": PARSER_VERSION, "source_file": str(source.resolve()),
        "started_at": utc_now(), "year": year, "state_fips": "48", "county_filter": counties,
        "rows_read": 0, "rows_rejected": 0, "rows_filtered": 0,
        # Valid rows before geographical filtering, and published rows after deduplication.
        "source_count_quality": dict(reported_positive=0, reported_zero=0, missing_unknown=0),
        "output_count_quality": dict(reported_positive=0, reported_zero=0, missing_unknown=0),
        "output_quality_by_county": {},
        "quality_notices": [],
        "off_grid_timestamp_rows": 0,
        "identical_duplicates_removed": 0, "rows_written": 0, "expected_source_rows": expected_rows,
        "limitations": ["FIPS checked structurally, not against an authoritative county-vintage catalog.",
                        "Missing intervals remain absent; no zero filling or outage-event inference.",
                        "Source blank counts are preserved as null, not inferred zeros.",
                        "A source-reported zero does not certify complete utility coverage.",
                        "Duplicate checking applies to the selected Texas/county subset."],
    }
    # A failed run is retained for inspection; no incomplete year partition is published.
    stage = Path(tempfile.mkdtemp(dir=output_root, prefix=f".year-{year}-"))
    try:
        if chunk_size < 1:
            raise ValueError("chunk_size must be positive")
        with source.open(encoding="utf-8-sig", newline="") as stream:
            header = next(csv.reader(stream))
        count_column = "sum" if year == 2023 and "sum" in header else "customers_out"
        required = {"fips_code", "county", "state", count_column, "run_start_time"}
        report["source_header"] = header
        report["count_column"] = count_column
        if len(header) != len(set(header)) or set(header) != required:
            raise ValueError(f"Unexpected header: expected {sorted(required)}, received {header}")
        report["source_checksums"] = checksums(source)
        sidecar = source.with_name(source.name + ".download.json")
        if sidecar.exists():
            origin = json.loads(sidecar.read_text())
            if origin.get("sha256") != report["source_checksums"]["sha256"]:
                raise ValueError("Raw CSV no longer matches its download manifest")
            report["download"] = origin
        else:
            report["download"] = None
        db_path = stage / "duplicates.sqlite"
        connection = sqlite3.connect(db_path)
        connection.execute("CREATE TABLE seen (county_fips TEXT, observed_at TEXT, customers_out INTEGER, PRIMARY KEY (county_fips, observed_at)) WITHOUT ROWID")
        parquet_path = stage / "observations.parquet"
        observed_counties: set[str] = set()
        earliest, latest = None, None
        try:
            with pq.ParquetWriter(parquet_path, SCHEMA, compression="zstd") as writer:
                chunks = pd.read_csv(source, dtype="string", keep_default_na=False, skip_blank_lines=False,
                                     encoding="utf-8-sig", chunksize=chunk_size)
                for chunk in chunks:
                    if not isinstance(chunk.index, pd.RangeIndex):
                        raise ValueError("CSV rows have more fields than the header; refusing implicit index parsing")
                    report["rows_read"] += len(chunk)
                    clean, reasons = normalize(chunk, year, count_column)
                    add_counts(report["source_count_quality"], count_quality(clean))
                    report["off_grid_timestamp_rows"] += int((
                        clean.observed_at.dt.minute.mod(15).ne(0) | clean.observed_at.dt.second.ne(0)
                    ).sum())
                    rejected = chunk.loc[reasons.ne("")].copy()
                    report["rows_rejected"] += len(rejected)
                    if not rejected.empty:
                        rejected["source_data_row"] = rejected.index + 1
                        rejected["reasons"] = reasons.loc[rejected.index]
                        rejected_path = stage / "rejected_rows.csv"
                        rejected.to_csv(rejected_path, mode="a", index=False, header=not rejected_path.exists())
                    selected = clean.county_fips.str.startswith("48")
                    if counties:
                        selected &= clean.county_fips.isin(counties)
                    report["rows_filtered"] += int((~selected).sum())
                    clean, duplicates = unique_rows(connection, clean.loc[selected])
                    report["identical_duplicates_removed"] += duplicates
                    if not clean.empty:
                        writer.write_table(pa.Table.from_pandas(clean, schema=SCHEMA, preserve_index=False))
                        report["rows_written"] += len(clean)
                        add_counts(report["output_count_quality"], count_quality(clean))
                        for county, county_frame in clean.groupby("county_fips"):
                            total = report["output_quality_by_county"].setdefault(
                                county, dict(reported_positive=0, reported_zero=0, missing_unknown=0))
                            add_counts(total, count_quality(county_frame))
                        observed_counties.update(clean.county_fips)
                        low, high = clean.observed_at.min(), clean.observed_at.max()
                        earliest = low if earliest is None else min(earliest, low)
                        latest = high if latest is None else max(latest, high)
                    print(f"{year}: read {report['rows_read']:,}; retained {report['rows_written']:,}; rejected {report['rows_rejected']:,}", flush=True)
        finally:
            connection.close()
        db_path.unlink()
        report["counties_found"] = sorted(observed_counties)
        report["counties_without_observations"] = sorted(set(counties or []) - observed_counties)
        report["timestamp_min"] = earliest.isoformat() if earliest is not None else None
        report["timestamp_max"] = latest.isoformat() if latest is not None else None
        if report["source_count_quality"]["missing_unknown"]:
            report["quality_notices"].append("Blank source counts were retained as null/missing_unknown, not rejected or imputed.")
        if report["source_count_quality"]["reported_zero"]:
            report["quality_notices"].append("Explicit source zero counts were retained as zero/reported; coverage remains uncertain.")
        if report["rows_rejected"]:
            raise ValueError("Invalid rows found; inspect rejected_rows.csv before publishing")
        if expected_rows is not None and report["rows_read"] != expected_rows:
            raise ValueError(f"Source row count differs from expected {expected_rows:,}")
        if not report["rows_written"]:
            raise ValueError("No matching observations; refusing to publish an empty dataset")
        metadata = pq.read_metadata(parquet_path)
        if metadata.num_rows != report["rows_written"] or not pq.read_schema(parquet_path).equals(SCHEMA, check_metadata=False):
            raise ValueError("Parquet read-back row count or schema mismatch")
        null_count = sum(metadata.row_group(index).column(SCHEMA.get_field_index("customers_out")).statistics.null_count
                         for index in range(metadata.num_row_groups))
        if null_count != report["output_count_quality"]["missing_unknown"]:
            raise ValueError("Parquet read-back missing-count mismatch")
        if sum(report["output_count_quality"].values()) != report["rows_written"]:
            raise ValueError("Output quality-count accounting mismatch")
        if report["rows_read"] != sum(report[key] for key in (
            "rows_rejected", "rows_filtered", "identical_duplicates_removed", "rows_written")):
            raise ValueError("Row accounting mismatch")
        report.update(status="passed", completed_at=utc_now(), output_schema=str(SCHEMA), output_checksums=checksums(parquet_path))
        write_json(stage / "validation.json", report)
        stage.rename(destination)
        print(f"Published {destination}", flush=True)
        return destination
    except Exception as error:
        report.update(status="failed", completed_at=utc_now(), error=str(error))
        write_json(stage / "validation.json", report)
        raise ValueError(f"{error}. Diagnostic files retained at {stage}") from error


def parse_years(values: list[str]) -> list[int]:
    years: set[int] = set()
    for value in values:
        if re.fullmatch(r"\d{4}-\d{4}", value):
            first, last = map(int, value.split("-"))
            if last < first:
                raise ValueError("Year range must ascend")
            years.update(range(first, last + 1))
        elif re.fullmatch(r"\d{4}", value):
            years.add(int(value))
        else:
            raise ValueError(f"Invalid year or range: {value}")
    if not years or min(years) < 2014 or max(years) > 2025:
        raise ValueError("This parser supports reviewed release years 2014–2025")
    return sorted(years)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--years", nargs="+", default=["2025"], help="Years or range, e.g. 2021 2024 or 2018-2025")
    parser.add_argument("--version", type=int, default=4, help="Pinned Figshare article version (default 4)")
    parser.add_argument("--county-fips", nargs="+", help="Optional Texas counties; otherwise keep all Texas")
    parser.add_argument("--raw-dir", type=Path, default=ROOT / "data/raw/eaglei")
    parser.add_argument("--reference-dir", type=Path, default=ROOT / "data/raw/reference")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "data/processed/outage_observations")
    parser.add_argument("--chunk-size", type=int, default=250_000)
    parser.add_argument("--expected-rows", type=int, help="Optional nationwide source row count; single-year runs only")
    parser.add_argument("--local-only", action="store_true", help="Use existing CSVs; make no network requests")
    parser.add_argument("--dry-run", action="store_true", help="List selected input files and download sizes; write nothing")
    args = parser.parse_args()
    try:
        years = parse_years(args.years)
        if args.chunk_size < 1 or (args.expected_rows is not None and (len(years) != 1 or args.expected_rows < 1)):
            raise ValueError("Use a positive chunk size and a positive expected count for a single year")
        if args.county_fips and any(not re.fullmatch(r"48\d{3}", code) or code == "48000" for code in args.county_fips):
            raise ValueError("--county-fips must contain five-digit Texas county codes")
        if args.local_only:
            for year in years:
                source = args.raw_dir / f"eaglei_outages_{year}.csv"
                if not source.is_file():
                    raise FileNotFoundError(source)
                print(f"Local input: {source} ({source.stat().st_size:,} bytes)")
        else:
            catalog = get_catalog(args.version)
            selected = select_files(catalog, years)
            for entry in selected:
                print(f"{entry['name']}: {entry['size']:,} bytes")
            print(f"Total selected: {sum(entry['size'] for entry in selected) / 1e9:.2f} GB. Downloads are national; output is Texas only.")
        if args.dry_run:
            return 0
        for year in years:
            if (args.output_dir / f"year={year}").exists():
                raise FileExistsError(f"Output for {year} exists; choose a new --output-dir")
        if not args.local_only:
            for entry in selected:
                directory = args.reference_dir if entry["name"] in REFERENCES else args.raw_dir
                download(entry, directory, args.version)
        for year in years:
            convert(args.raw_dir / f"eaglei_outages_{year}.csv", args.output_dir, year,
                    counties=args.county_fips, chunk_size=args.chunk_size, expected_rows=args.expected_rows)
        return 0
    except (OSError, ValueError, StopIteration) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
