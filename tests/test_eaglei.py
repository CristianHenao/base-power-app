from pathlib import Path

import pandas as pd
import pytest

from pipeline.sources.eaglei import (
    EagleiColumns,
    build_events,
    columns_from_settings,
    county_series,
    events_frame,
    keep_from,
    keep_texas,
    read_yearly_csv,
    top_events,
)

COLUMNS = EagleiColumns(
    fips="fips_code",
    state="state",
    customers_out="customers_out",
    timestamp="run_start_time",
)

# Names in this fixture are a test choice. They are not a claim about the real extract.
SYNTHETIC_CSV = """\
fips_code,state,customers_out,run_start_time
40109,Oklahoma,9000,2021-02-15T00:00:00Z
48085.0,Texas,8000,2017-06-01T00:00:00Z
48085.0,Texas,8000,2017-06-01T00:15:00Z
48085,Texas,5000,2021-02-15T06:00:00Z
48085,Texas,5000,2021-02-15T06:15:00Z
48085,Texas,5000,2021-02-15T06:30:00Z
48085,Texas,5000,2021-02-15T06:45:00Z
"""


def _csv(tmp_path: Path) -> Path:
    path = tmp_path / "2021.csv"
    path.write_text(SYNTHETIC_CSV)
    return path


def test_keep_texas_by_fips_prefix(tmp_path: Path):
    frame = keep_texas(read_yearly_csv(_csv(tmp_path), COLUMNS))
    assert set(frame["county_fips"]) == {"48085"}
    assert "48085.0" not in set(frame["county_fips"])


def test_keep_from_drops_before_2018(tmp_path: Path):
    frame = keep_from(
        read_yearly_csv(_csv(tmp_path), COLUMNS),
        pd.Timestamp("2018-01-01", tz="UTC"),
    )
    assert frame["timestamp"].min() >= pd.Timestamp("2018-01-01", tz="UTC")
    assert (frame["timestamp"].dt.year < 2018).sum() == 0


def test_county_series_is_15min_for_one_fips(tmp_path: Path):
    frame = keep_from(
        keep_texas(read_yearly_csv(_csv(tmp_path), COLUMNS)),
        pd.Timestamp("2018-01-01", tz="UTC"),
    )
    series = county_series(frame, "48085")
    assert len(series) == 4
    assert series.index.tz is not None
    spacing = series.index.to_series().diff().dropna()
    assert (spacing == pd.Timedelta(minutes=15)).all()


def test_missing_column_raises(tmp_path: Path):
    path = tmp_path / "bad.csv"
    path.write_text("fips_code,state,customers_out\n48085,Texas,10\n")
    with pytest.raises(ValueError, match="run_start_time"):
        read_yearly_csv(path, COLUMNS)


def test_events_frame_requires_customer_counts():
    index = pd.date_range("2021-02-15", periods=4, freq="15min", tz="UTC")
    series = pd.Series([5_000.0, 5_000.0, 5_000.0, 5_000.0], index=index)
    with pytest.raises(ValueError, match="48085"):
        events_frame({"48085": series}, {})


def test_build_events_writes_parquet_with_county_fips(tmp_path: Path):
    raw = tmp_path / "raw"
    raw.mkdir()
    (raw / "2021.csv").write_text(SYNTHETIC_CSV)
    out = tmp_path / "processed" / "events.parquet"
    events = build_events(
        raw,
        out,
        COLUMNS,
        {"48085": 100_000.0},
        fips=("48085",),
    )
    loaded = pd.read_parquet(out)
    assert len(events) == 1
    assert list(loaded["county_fips"]) == ["48085"]
    assert loaded["peak_out"].iloc[0] == 5_000
    assert set(loaded.columns) >= {
        "county_fips",
        "p50_h_rotate",
        "p50_h_stay",
        "p90_h_rotate",
        "p90_h_stay",
    }
    assert loaded["start"].iloc[0].year == 2021


def test_top_events_ranks_by_customer_hours():
    frame = pd.DataFrame(
        {
            "county_fips": ["48085", "48085", "48201"],
            "customer_hours": [10.0, 50.0, 3.0],
        }
    )
    top = top_events(frame, n=1)
    assert list(top["customer_hours"]) == [50.0, 3.0]


def test_real_header_parses_utc_timestamp(tmp_path: Path):
    path = tmp_path / "eaglei_outages_2021.csv"
    path.write_text(
        "fips_code,county,state,customers_out,run_start_time\n"
        "48085,Collin,Texas,5000,2021-02-15 06:00:00\n"
        "48085,Collin,Texas,5000,2021-02-15 06:15:00\n"
    )
    frame = read_yearly_csv(path, columns_from_settings())
    assert list(frame["county_fips"]) == ["48085", "48085"]
    assert str(frame["timestamp"].iloc[0]) == "2021-02-15 06:00:00+00:00"


def test_2023_sum_column_is_customers_out(tmp_path: Path):
    path = tmp_path / "eaglei_outages_2023.csv"
    path.write_text(
        "fips_code,county,state,sum,run_start_time\n"
        "48085,Collin,Texas,13,2023-01-01 00:00:00\n"
    )
    frame = read_yearly_csv(path, columns_from_settings())
    assert frame["customers_out"].tolist() == [13]


def test_column_map_matches_reviewed_header():
    assert columns_from_settings() == EagleiColumns(
        fips="fips_code",
        state="state",
        customers_out="customers_out",
        timestamp="run_start_time",
    )
