import pandas as pd
import pytest

from pipeline.utility_map.hurricane import category, county_hurricane_index, hourly, parse_hurdat

TEXT = """AL092017,             HARVEY,     3,
20170825, 1800,  , HU, 27.8N,  96.8W, 115,  941,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0, -999
20170826, 0000,  , HU, 28.0N,  97.0W, 100,  950,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0, -999
20170826, 0600,  , TS, 28.2N,  97.2W,  60,  970,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0, -999
AL011999,            ARLENE,     1,
19990611, 1800,  , TD, 31.0N,  60.0W,  30, 1010,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0,    0, -999
"""


def test_parse_reads_storms_and_fixes() -> None:
    fixes = parse_hurdat(TEXT)
    assert list(fixes["name"].unique()) == ["HARVEY", "ARLENE"]
    harvey = fixes[fixes["storm_id"] == "AL092017"]
    assert harvey["lat"].tolist() == [27.8, 28.0, 28.2]
    assert harvey["lon"].tolist() == [-96.8, -97.0, -97.2]
    assert harvey["time_utc"].iloc[0] == pd.Timestamp("2017-08-25 18:00", tz="UTC")
    assert harvey["wind_kt"].tolist() == [115, 100, 60]


def test_hourly_interpolation_between_fixes() -> None:
    fixes = parse_hurdat(TEXT)
    points = hourly(fixes[fixes["storm_id"] == "AL092017"])
    assert len(points) == 13  # 12 hours at 1-hour steps, both ends included
    assert points["wind_kt"].iloc[6] == pytest.approx(100)


def test_category_steps() -> None:
    assert [category(w) for w in (30, 34, 64, 83, 96, 113, 137)] == [0, 0, 1, 2, 3, 4, 5]


def test_counties_within_100_km_of_tropical_storm_winds_are_hit() -> None:
    # A county point at 28.0N 96.5W is ~49 km east of the track; one at 28.0N 95.5W is ~147 km.
    points = pd.DataFrame({"storm_id": ["S"] * 2, "year": [2017] * 2, "lat": [28.0, 28.1],
                           "lon": [-97.0, -97.0], "wind_kt": [100.0, 60.0]})
    centers = pd.DataFrame({"county_fips": ["48001", "48003"], "lat": [28.0, 28.0], "lon": [-96.5, -95.5]})
    index = county_hurricane_index(points, centers, decades=1.0)
    assert index["48001"] == pytest.approx(100 / 64)
    assert index["48003"] == 0.0


def test_a_fix_with_a_missing_comma_between_lat_and_lon_still_parses() -> None:
    text = ("AL011950,               ABLE,     1,\n"
            "19500822, 1200,  , EX, 63.3N    7.5W,  45,  990,  -99,  -99,  -99,  -99,  -99,  -99,  -99,  -99,"
            "  -99,  -99,  -99,  -99, -999\n")
    fixes = parse_hurdat(text)
    assert fixes[["lat", "lon", "wind_kt"]].iloc[0].tolist() == [63.3, -7.5, 45.0]
