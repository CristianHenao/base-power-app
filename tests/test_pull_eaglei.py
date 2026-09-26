import hashlib
import io
import json
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq
import pytest

from pipeline import pull_eaglei as ingest


HEADER = "fips_code,county,state,customers_out,run_start_time\n"


def csv_file(tmp_path, rows, year=2025, header=HEADER):
    source = tmp_path / f"eaglei_outages_{year}.csv"
    source.write_text(header + "\n".join(rows) + "\n")
    return source


def manifest(directory):
    return json.loads((directory / "validation.json").read_text())


def test_chunked_conversion_filters_and_deduplicates_across_chunks(tmp_path):
    source = csv_file(tmp_path, [
        "01001,Autauga,Alabama,6,2025-01-01 00:00:00",
        "48201,Harris,Texas,12,2025-01-01 00:00:00",
        "48201,Harris,Texas,12,2025-01-01 00:00:00",
        "48201,Harris,Texas,8,2025-01-01 00:30:00",
        "48453,Travis,Texas,4,2025-01-01 00:00:00",
    ])
    result = ingest.convert(source, tmp_path / "out", 2025, chunk_size=2, counties=["48201"], expected_rows=5)
    frame = pd.read_parquet(result / "observations.parquet")
    report = manifest(result)
    assert report["status"] == "passed"
    assert report["rows_read"] == 5
    assert report["rows_filtered"] == 2
    assert report["identical_duplicates_removed"] == 1
    assert report["rows_written"] == 2
    assert frame.county_fips.tolist() == ["48201", "48201"]
    assert frame.customers_out.tolist() == [12, 8]
    # No synthetic zero row is inserted into the 15-minute gap.
    assert frame.observed_at.dt.minute.tolist() == [0, 30]
    assert str(frame.observed_at.dt.tz) == "UTC"
    assert pq.read_schema(result / "observations.parquet").equals(ingest.SCHEMA, check_metadata=False)
    assert not (result / "duplicates.sqlite").exists()


def test_readme_format_fips_normalization_and_2023_alias(tmp_path):
    source = csv_file(tmp_path, ["48201.0,Harris,Texas,13,01/02/23 03:15"], year=2023, header=HEADER.replace("customers_out", "sum"))
    result = ingest.convert(source, tmp_path / "out", 2023)
    row = pd.read_parquet(result / "observations.parquet").iloc[0]
    assert row.county_fips == "48201"
    assert row.observed_at == pd.Timestamp("2023-01-02T03:15:00Z")
    assert manifest(result)["count_column"] == "sum"


@pytest.mark.parametrize("chunk_size", [1, 10])
def test_conflicting_duplicates_block_publication(tmp_path, chunk_size):
    source = csv_file(tmp_path, [
        "48201,Harris,Texas,12,2025-01-01 00:00:00",
        "48201,Harris,Texas,99,2025-01-01 00:00:00",
    ])
    out = tmp_path / "out"
    with pytest.raises(ValueError, match="Conflicting customer counts"):
        ingest.convert(source, out, 2025, chunk_size=chunk_size)
    assert not (out / "year=2025").exists()
    assert manifest(next(out.glob(".year-*")))["status"] == "failed"


@pytest.mark.parametrize("row,reason", [
    ("48201,Harris,Texas,-1,2025-01-01 00:00:00", "invalid_customers_out"),
    ("48201,Harris,Texas,1.5,2025-01-01 00:00:00", "invalid_customers_out"),
    ("48201,Harris,Texas,inf,2025-01-01 00:00:00", "invalid_customers_out"),
    ("48201,Harris,Texas,NaN,2025-01-01 00:00:00", "invalid_customers_out"),
    ("48201,Harris,Texas,NULL,2025-01-01 00:00:00", "invalid_customers_out"),
    ("48201,Harris,Texas,not-a-count,2025-01-01 00:00:00", "invalid_customers_out"),
    ("48201,Harris,Texas,10,2024-01-01 00:00:00", "invalid_timestamp_or_year"),
    ("48201,Harris,Texas,10,not a timestamp", "invalid_timestamp_or_year"),
    ("bad,Harris,Texas,10,2025-01-01 00:00:00", "invalid_fips"),
    ("48201,Harris,Oklahoma,10,2025-01-01 00:00:00", "texas_state_fips_mismatch"),
])
def test_invalid_rows_are_retained_and_never_published(tmp_path, row, reason):
    source = csv_file(tmp_path, [row])
    out = tmp_path / "out"
    with pytest.raises(ValueError, match="Invalid rows"):
        ingest.convert(source, out, 2025)
    stage = next(out.glob(".year-*"))
    rejected = pd.read_csv(stage / "rejected_rows.csv")
    assert reason in rejected.reasons.iloc[0]
    assert manifest(stage)["rows_rejected"] == 1
    assert not (out / "year=2025").exists()


def test_wrong_header_and_extra_csv_values_fail(tmp_path):
    source = csv_file(tmp_path, [], header=HEADER.replace("customers_out", "outages"))
    with pytest.raises(ValueError, match="Unexpected header"):
        ingest.convert(source, tmp_path / "header-out", 2025)
    source = csv_file(tmp_path, ["48201,Harris,Texas,12,2025-01-01 00:00:00,extra"])
    with pytest.raises(ValueError, match="more fields"):
        ingest.convert(source, tmp_path / "width-out", 2025)


def test_row_count_and_existing_output_guards(tmp_path):
    source = csv_file(tmp_path, ["48201,Harris,Texas,12,2025-01-01 00:00:00"])
    out = tmp_path / "out"
    with pytest.raises(ValueError, match="row count"):
        ingest.convert(source, out, 2025, expected_rows=2)
    result = ingest.convert(source, out, 2025, expected_rows=1)
    before = (result / "observations.parquet").read_bytes()
    with pytest.raises(FileExistsError):
        ingest.convert(source, out, 2025)
    assert (result / "observations.parquet").read_bytes() == before


def test_no_selected_rows_blocks_empty_output(tmp_path):
    source = csv_file(tmp_path, ["01001,Autauga,Alabama,6,2025-01-01 00:00:00"])
    with pytest.raises(ValueError, match="No matching observations"):
        ingest.convert(source, tmp_path / "out", 2025)


@pytest.mark.parametrize("chunk_size", [1, 20])
def test_blanks_zeros_and_duplicates_preserve_distinct_meanings(tmp_path, chunk_size):
    source = csv_file(tmp_path, [
        "06027,Inyo,California,,2025-01-01 00:00:00",
        "06027,Inyo,California,0,2025-01-01 00:15:00",
        "48085,Collin,Texas,,2025-02-08 06:45:00",
        "48085,Collin,Texas,   ,2025-02-08 06:45:00",
        "48085,Collin,Texas,0,2025-02-08 07:00:00",
        "48085,Collin,Texas,0,2025-02-08 07:00:00",
        "48085,Collin,Texas,12,2025-02-08 07:30:00",
    ])
    result = ingest.convert(source, tmp_path / "out", 2025, counties=["48085"], chunk_size=chunk_size, expected_rows=7)
    table = pq.read_table(result / "observations.parquet")
    frame = table.to_pandas().sort_values("observed_at")
    assert pd.isna(frame.customers_out.iloc[0])
    assert frame.customers_out.iloc[1:].tolist() == [0, 12]
    assert frame.observation_status.tolist() == ["missing_unknown", "reported", "reported"]
    # Missing 07:15 remains absent and explicit null 06:45 remains a record.
    assert frame.observed_at.dt.strftime("%H:%M").tolist() == ["06:45", "07:00", "07:30"]
    report = manifest(result)
    assert report["rows_rejected"] == 0
    assert report["rows_filtered"] == 2
    assert report["identical_duplicates_removed"] == 2
    assert report["source_count_quality"] == {"reported_positive": 1, "reported_zero": 3, "missing_unknown": 3}
    expected = {"reported_positive": 1, "reported_zero": 1, "missing_unknown": 1}
    assert report["output_count_quality"] == expected
    assert report["output_quality_by_county"] == {"48085": expected}
    assert report["quality_notices"]


@pytest.mark.parametrize("chunk_size", [1, 20])
@pytest.mark.parametrize("values", [("", "0"), ("0", ""), ("", "12"), ("12", "")])
def test_null_numeric_conflicts_never_silently_collapse(tmp_path, chunk_size, values):
    source = csv_file(tmp_path, [
        f"48201,Harris,Texas,{value},2025-01-01 00:00:00" for value in values
    ])
    with pytest.raises(ValueError, match="Conflicting customer counts"):
        ingest.convert(source, tmp_path / "out", 2025, chunk_size=chunk_size)
    assert not (tmp_path / "out/year=2025").exists()


def test_all_unknown_partition_has_valid_nullable_schema(tmp_path):
    source = csv_file(tmp_path, ["48201,Harris,Texas,,2025-01-01 00:01:00"])
    result = ingest.convert(source, tmp_path / "out", 2025)
    table = pq.read_table(result / "observations.parquet")
    assert table.column("customers_out").null_count == 1
    assert table.column("observation_status").to_pylist() == ["missing_unknown"]
    assert manifest(result)["off_grid_timestamp_rows"] == 1


def test_download_verifies_and_reuses_local_file(tmp_path, monkeypatch):
    body = b"public example\n"
    entry = {"id": 1, "name": "example.csv", "size": len(body),
             "computed_md5": hashlib.md5(body).hexdigest(), "download_url": "https://example.test/file"}
    calls = []
    def fetch(url):
        calls.append(url)
        return io.BytesIO(body)
    monkeypatch.setattr(ingest, "open_url", fetch)
    result = ingest.download(entry, tmp_path, 4)
    assert result.read_bytes() == body
    sidecar = json.loads(result.with_name("example.csv.download.json").read_text())
    assert sidecar["sha256"] == hashlib.sha256(body).hexdigest()
    ingest.download(entry, tmp_path, 4)
    assert len(calls) == 1
    result.write_bytes(b"broken")
    with pytest.raises(ValueError, match="checksum mismatch"):
        ingest.download(entry, tmp_path, 4)
    assert result.read_bytes() == b"broken"


def test_checksum_failure_never_publishes_download(tmp_path, monkeypatch):
    entry = {"id": 1, "name": "bad.csv", "size": 3, "computed_md5": "0" * 32, "download_url": "https://example.test/file"}
    monkeypatch.setattr(ingest, "open_url", lambda url: io.BytesIO(b"bad"))
    monkeypatch.setattr(ingest.time, "sleep", lambda seconds: None)
    with pytest.raises(ValueError, match="checksum mismatch"):
        ingest.download(entry, tmp_path, 4)
    assert not (tmp_path / "bad.csv").exists()
    assert not list(tmp_path.glob("*.part"))


def test_changed_source_does_not_inherit_old_provenance(tmp_path):
    source = csv_file(tmp_path, ["48201,Harris,Texas,12,2025-01-01 00:00:00"])
    source.with_name(source.name + ".download.json").write_text('{"sha256":"wrong"}')
    with pytest.raises(ValueError, match="no longer matches"):
        ingest.convert(source, tmp_path / "out", 2025)


def test_local_dry_run_has_no_network_or_writes(tmp_path, monkeypatch):
    csv_file(tmp_path, ["48201,Harris,Texas,12,2025-01-01 00:00:00"])
    monkeypatch.setattr(ingest, "open_url", lambda url: pytest.fail("Network request"))
    output = tmp_path / "out"
    monkeypatch.setattr("sys.argv", ["pull_eaglei", "--local-only", "--dry-run", "--raw-dir", str(tmp_path), "--output-dir", str(output)])
    assert ingest.main() == 0
    assert not output.exists()


def test_years_and_file_selection():
    assert ingest.parse_years(["2021", "2023-2025", "2024"]) == [2021, 2023, 2024, 2025]
    with pytest.raises(ValueError):
        ingest.parse_years(["2026"])
    with pytest.raises(ValueError):
        ingest.select_files({"files": []}, [2025])
