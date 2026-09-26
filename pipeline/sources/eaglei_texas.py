"""Cut the national EAGLE-I yearly CSVs down to Texas.

Streams each file through DuckDB so a 1.4 GB year never sits in pandas memory.
Writes Texas-only yearly CSVs with the original header (a drop-in for
pipeline/sources/eaglei.py), one normalized Texas parquet, and a demo-county subset.

Run: python -m pipeline.sources.eaglei_texas
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import duckdb

from pipeline import settings

TX_CSV_DIR = settings.REPO_ROOT / "data" / "raw" / "eaglei_tx"
TX_PARQUET = settings.REPO_ROOT / "data" / "processed" / "eaglei_tx.parquet"
DEMO_PARQUET = settings.REPO_ROOT / "data" / "processed" / "eaglei_demo.parquet"

YEAR_FILE = re.compile(r"eaglei_outages_(\d{4})\.csv$")


def yearly_files(raw_dir: Path, start_year: int) -> list[tuple[int, Path]]:
    """Yearly CSVs at or after `start_year`, sorted by year."""
    found = []
    for path in raw_dir.glob("eaglei_outages_*.csv"):
        match = YEAR_FILE.search(path.name)
        if match and int(match.group(1)) >= start_year:
            found.append((int(match.group(1)), path))
    return sorted(found)


def _texas_select(path: Path) -> str:
    # FIPS arrives as text or as a float like 48085.0; normalize before filtering.
    fips = (
        f"lpad(regexp_replace(trim(CAST({settings.EAGLEI_FIPS_COL} AS VARCHAR)), "
        r"'\.0$', ''), 5, '0')"
    )
    return f"""
        SELECT {fips} AS county_fips,
               county,
               CAST({settings.EAGLEI_CUSTOMERS_OUT_COL} AS DOUBLE) AS customers_out,
               CAST({settings.EAGLEI_TIMESTAMP_COL} AS TIMESTAMP) AS run_start_time
        FROM read_csv('{path}', header = true, all_varchar = true)
        WHERE {fips} LIKE '48%'
          AND {settings.EAGLEI_CUSTOMERS_OUT_COL} IS NOT NULL
    """


def extract_year(con: duckdb.DuckDBPyConnection, path: Path, out_csv: Path) -> int:
    """Write the Texas rows of one yearly CSV with the original column names."""
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    con.execute(
        f"""
        COPY (
            SELECT county_fips AS {settings.EAGLEI_FIPS_COL},
                   county,
                   'Texas' AS {settings.EAGLEI_STATE_COL},
                   customers_out AS {settings.EAGLEI_CUSTOMERS_OUT_COL},
                   strftime(run_start_time, '%Y-%m-%d %H:%M:%S') AS {settings.EAGLEI_TIMESTAMP_COL}
            FROM ({_texas_select(path)})
            ORDER BY 1, 5
        ) TO '{out_csv}' (HEADER, DELIMITER ',')
        """
    )
    return con.execute(f"SELECT count(*) FROM read_csv('{out_csv}', header = true)").fetchone()[0]


def write_parquets(
    con: duckdb.DuckDBPyConnection,
    tx_csv_dir: Path,
    tx_parquet: Path,
    demo_parquet: Path,
    demo_fips: tuple[str, ...],
) -> tuple[int, int]:
    """Combine the Texas CSVs into one parquet (timestamps as UTC) and a demo subset."""
    tx_parquet.parent.mkdir(parents=True, exist_ok=True)
    con.execute("SET TimeZone = 'UTC'")
    con.execute(
        f"""
        CREATE OR REPLACE TEMP TABLE tx AS
        SELECT lpad(CAST({settings.EAGLEI_FIPS_COL} AS VARCHAR), 5, '0') AS county_fips,
               county,
               CAST({settings.EAGLEI_CUSTOMERS_OUT_COL} AS DOUBLE) AS customers_out,
               CAST({settings.EAGLEI_TIMESTAMP_COL} AS TIMESTAMP) AT TIME ZONE 'UTC' AS timestamp
        FROM read_csv('{tx_csv_dir}/eaglei_outages_*.csv', header = true, all_varchar = true)
        """
    )
    con.execute(f"COPY (SELECT * FROM tx ORDER BY county_fips, timestamp) TO '{tx_parquet}' (FORMAT parquet)")
    fips_list = ", ".join(f"'{code}'" for code in demo_fips)
    con.execute(
        f"""
        COPY (SELECT * FROM tx WHERE county_fips IN ({fips_list}) ORDER BY county_fips, timestamp)
        TO '{demo_parquet}' (FORMAT parquet)
        """
    )
    total = con.execute("SELECT count(*) FROM tx").fetchone()[0]
    demo = con.execute(f"SELECT count(*) FROM tx WHERE county_fips IN ({fips_list})").fetchone()[0]
    return total, demo


def main(argv: list[str]) -> int:
    start_year = int(settings.RATES_START[:4])
    files = yearly_files(settings.RAW_EAGLEI_DIR, start_year)
    if argv:
        wanted = {int(year) for year in argv}
        files = [(year, path) for year, path in files if year in wanted]
    if not files:
        print(f"no EAGLE-I yearly CSVs from {start_year} in {settings.RAW_EAGLEI_DIR}")
        return 1
    con = duckdb.connect()
    for year, path in files:
        rows = extract_year(con, path, TX_CSV_DIR / path.name)
        print(f"{year}: {rows:,} Texas rows")
    total, demo = write_parquets(con, TX_CSV_DIR, TX_PARQUET, DEMO_PARQUET, settings.DEMO_FIPS)
    print(f"wrote {total:,} rows to {TX_PARQUET}")
    print(f"wrote {demo:,} demo-county rows to {DEMO_PARQUET}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
