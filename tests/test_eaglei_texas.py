from pathlib import Path

import duckdb
import pandas as pd

from pipeline.sources.eaglei import EagleiColumns, read_yearly_csv
from pipeline.sources.eaglei_texas import extract_year, write_parquets, yearly_files

# Mirrors the real header; values are synthetic.
NATIONAL_CSV = """\
fips_code,county,state,customers_out,run_start_time
01015,Calhoun,Alabama,1,2021-02-15 00:00:00
48085.0,Collin,Texas,5000,2021-02-15 06:00:00
48085,Collin,Texas,4000,2021-02-15 06:15:00
48001,Anderson,Texas,12,2021-02-15 06:00:00
40109,Oklahoma,Oklahoma,9000,2021-02-15 06:00:00
"""


def _national(tmp_path: Path, year: int = 2021) -> Path:
    raw = tmp_path / "raw"
    raw.mkdir(exist_ok=True)
    path = raw / f"eaglei_outages_{year}.csv"
    path.write_text(NATIONAL_CSV)
    return path


def test_yearly_files_skips_early_years_and_other_csvs(tmp_path: Path) -> None:
    _national(tmp_path, 2017)
    _national(tmp_path, 2021)
    (tmp_path / "raw" / "DQI.csv").write_text("x\n1\n")
    assert [year for year, _ in yearly_files(tmp_path / "raw", 2018)] == [2021]


def test_extract_year_keeps_texas_and_stays_readable_by_eaglei_loader(tmp_path: Path) -> None:
    out = tmp_path / "tx" / "eaglei_outages_2021.csv"
    rows = extract_year(duckdb.connect(), _national(tmp_path), out)
    assert rows == 3

    columns = EagleiColumns("fips_code", "state", "customers_out", "run_start_time")
    frame = read_yearly_csv(out, columns)
    assert sorted(frame["county_fips"].unique()) == ["48001", "48085"]
    assert set(frame["state"]) == {"Texas"}
    assert str(frame["timestamp"].dt.tz) == "UTC"


def test_write_parquets_splits_demo_counties(tmp_path: Path) -> None:
    con = duckdb.connect()
    tx_dir = tmp_path / "tx"
    extract_year(con, _national(tmp_path), tx_dir / "eaglei_outages_2021.csv")
    total, demo = write_parquets(
        con, tx_dir, tmp_path / "tx.parquet", tmp_path / "demo.parquet", ("48085",)
    )
    assert (total, demo) == (3, 2)

    demo_frame = pd.read_parquet(tmp_path / "demo.parquet")
    assert set(demo_frame["county_fips"]) == {"48085"}
    assert demo_frame["timestamp"].iloc[0] == pd.Timestamp("2021-02-15 06:00", tz="UTC")


def test_2023_header_with_sum_column_is_normalized(tmp_path: Path) -> None:
    raw = tmp_path / "raw"
    raw.mkdir()
    path = raw / "eaglei_outages_2023.csv"
    path.write_text(NATIONAL_CSV.replace("customers_out", "sum", 1))
    out = tmp_path / "tx" / path.name
    assert extract_year(duckdb.connect(), path, out) == 3
    assert out.read_text().splitlines()[0] == "fips_code,county,state,customers_out,run_start_time"


def test_2024_header_with_extra_total_customers_column(tmp_path: Path) -> None:
    raw = tmp_path / "raw"
    raw.mkdir()
    path = raw / "eaglei_outages_2024.csv"
    lines = NATIONAL_CSV.strip().splitlines()
    path.write_text("\n".join([lines[0] + ",total_customers"] + [line + ",100" for line in lines[1:]]) + "\n")
    assert extract_year(duckdb.connect(), path, tmp_path / "tx" / path.name) == 3
