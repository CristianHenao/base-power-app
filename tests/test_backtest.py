from pathlib import Path

import pandas as pd
import pytest

from pipeline import settings
from pipeline.backtest import first_seen, load_zones, long_counts, years_in_window


def test_years_start_at_the_later_of_window_and_first_reading():
    first = pd.Series(
        pd.to_datetime(["2017-06-01", "2020-01-01"], utc=True),
        index=["48085", "48201"],
    )
    years = years_in_window(first, "2018-01-01", "2023-01-01")
    assert years["48085"] == pytest.approx(1826 / 365.25)
    assert years["48201"] == pytest.approx(1096 / 365.25)


def test_years_are_zero_for_a_county_that_starts_after_the_window():
    first = pd.Series(pd.to_datetime(["2024-03-01"], utc=True), index=["48453"])
    assert years_in_window(first, "2018-01-01", "2023-01-01")["48453"] == 0.0


def test_long_counts_use_the_start_window_end_exclusive():
    events = pd.DataFrame(
        {
            "county_fips": ["48085", "48085", "48085"],
            "start": pd.to_datetime(["2022-12-31 23:45", "2023-01-01 00:00", "2021-02-15 06:00"], utc=True),
            "share_12h_stay": [0.1, 0.2, 0.3],
        }
    )
    train = long_counts(events, "2018-01-01", "2023-01-01")
    assert train["48085"] == pytest.approx(0.4)


def test_first_seen_is_the_earliest_reading():
    frame = pd.DataFrame(
        {
            "county_fips": ["48085", "48085"],
            "timestamp": pd.to_datetime(["2019-01-02", "2018-05-01"], utc=True),
        }
    )
    assert first_seen(frame)["48085"] == pd.Timestamp("2018-05-01", tz="UTC")


def test_missing_crosswalk_falls_back_to_one_statewide_group(tmp_path: Path):
    zones, scope = load_zones(tmp_path / "missing.csv", pd.Index(["48085", "48201"]))
    assert scope == "statewide"
    assert set(zones) == {"TX"}


def test_demo_zones_match_the_crosswalk():
    zones, scope = load_zones(settings.COUNTY_WEATHER_ZONE_CSV, pd.Index(list(settings.DEMO_FIPS)))
    assert scope == "weather_zone"
    assert zones.to_dict() == settings.DEMO_WEATHER_ZONE


def test_crosswalk_must_cover_every_county(tmp_path: Path):
    path = tmp_path / "county_weather_zone.csv"
    path.write_text("county_fips,weather_zone\n48085,NCENT\n")
    with pytest.raises(ValueError, match="48201"):
        load_zones(path, pd.Index(["48085", "48201"]))
