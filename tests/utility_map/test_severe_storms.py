import pandas as pd
import pytest

from pipeline.utility_map.severe_storms import county_reports_index, severe_reports


def _hail(**kw):
    return {"om": 1, "yr": 2010, "st": "TX", "stf": 48, "f1": 201, "mag": 1.25, "slat": 29.8, "slon": -95.4} | kw


def test_severe_reports_keep_texas_one_inch_hail_and_every_wind_report() -> None:
    hail = pd.DataFrame([_hail(), _hail(mag=0.75), _hail(st="OK", stf=40), _hail(yr=1999)])
    wind = pd.DataFrame([_hail(mag=0.0), _hail(mag=61.0)])  # 0 = speed not measured, still severe
    reports = severe_reports(hail, wind, years=range(2000, 2026))
    assert sorted(reports["kind"]) == ["hail", "wind", "wind"]
    assert set(reports["county_fips"]) == {"48201"}


def test_index_is_reports_per_thousand_km2_per_year() -> None:
    reports = pd.DataFrame({"county_fips": ["48201"] * 3, "kind": ["hail", "wind", "wind"]})
    area = pd.Series({"48201": 4000.0, "48167": 1000.0})
    index = county_reports_index(reports, area, years=2)
    assert index["48201"] == pytest.approx(3 / 4 / 2)
    assert index["48167"] == 0.0


def test_points_are_grouped_by_kind_and_size_class() -> None:
    from pipeline.utility_map.severe_storms import points_geojson

    reports = pd.DataFrame({
        "kind": ["hail", "hail", "hail", "wind", "wind"],
        "mag": [1.0, 1.75, 2.75, 0.0, 70.0],
        "slon": [-95.4, -95.41, -95.42, -97.0, -97.1],
        "slat": [29.8, 29.81, 29.82, 31.0, 31.1],
    })
    geo = points_geojson(reports)
    classes = {(f["properties"]["kind"], f["properties"]["size"]): len(f["geometry"]["coordinates"])
               for f in geo["features"]}
    assert classes == {("hail", 1): 1, ("hail", 2): 1, ("hail", 3): 1, ("wind", 1): 1, ("wind", 3): 1}
    assert all(f["geometry"]["type"] == "MultiPoint" for f in geo["features"])
