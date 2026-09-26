import pandas as pd
import pytest
from shapely.geometry import box

from pipeline.utility_map.tornado import county_tornado_index, texas_tracks, track_lengths

COUNTIES = {"48001": box(-98, 30, -97, 31), "48003": box(-97, 30, -96, 31)}


def _row(**kw) -> dict:
    row = {"om": 1, "yr": 2010, "mo": 5, "dy": 1, "date": "2010-05-01", "st": "TX", "mag": 1, "inj": 0, "fat": 0,
           "slat": 30.5, "slon": -97.5, "elat": 30.5, "elon": -96.5, "len": 60.0, "ns": 1, "sn": 1, "sg": 1}
    return row | kw


def test_texas_tracks_keep_texas_and_border_crossing_tracks_once() -> None:
    frame = pd.DataFrame([
        _row(om=1),                          # Texas only
        _row(om=2, st="OK"),                 # Oklahoma only: out
        _row(om=3, ns=2, sn=0, sg=1),        # starts in Texas, crosses a border: in (clipped later)
        _row(om=5, st="OK", ns=2, sn=0),     # starts in Oklahoma, crosses into Texas: in (clipped later)
        _row(om=4, yr=1999),                 # outside the window
        _row(om=6, ns=2, sn=0, sg=1),        # whole track that also has a Texas segment row...
        _row(om=6, ns=2, sn=1, sg=2),        # ...so only the segment is kept
        _row(om=6, st="OK", ns=2, sn=1, sg=2),
    ])
    kept = texas_tracks(frame, years=range(2000, 2026))
    assert sorted(zip(kept["om"], kept["sg"])) == [(1, 1), (3, 1), (5, 1), (6, 2)]


def test_a_track_is_split_between_counties_by_the_distance_it_runs_in_each() -> None:
    lengths = track_lengths(pd.DataFrame([_row()]), COUNTIES)
    assert lengths.set_index("county_fips")["len_km"].to_dict() == pytest.approx(
        {"48001": 60 * 1.609344 / 2, "48003": 60 * 1.609344 / 2})


def test_a_touchdown_point_goes_to_its_county() -> None:
    lengths = track_lengths(pd.DataFrame([_row(elat=0.0, elon=0.0, len=0.2)]), COUNTIES)
    assert lengths["county_fips"].tolist() == ["48001"]
    assert lengths["len_km"].iloc[0] == pytest.approx(0.2 * 1.609344)


def test_index_weights_by_ef_and_scales_by_area_and_years() -> None:
    lengths = pd.DataFrame({"county_fips": ["48001", "48001"], "len_km": [10.0, 5.0], "mag": [2, -9]})
    area = pd.Series({"48001": 2000.0, "48003": 1000.0})
    index = county_tornado_index(lengths, area, years=10)
    # (10 × 3 + 5 × 1) km per 2 thousand km² per 10 years
    assert index["48001"] == pytest.approx(35 / 2 / 10)
    assert index["48003"] == 0.0
