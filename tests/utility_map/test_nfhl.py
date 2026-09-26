import json

import pytest
from shapely.geometry import box, mapping

from pipeline.utility_map.nfhl import build_county, flood_class


@pytest.mark.parametrize("props, expected", [
    ({"FLD_ZONE": "AE", "ZONE_SUBTY": "FLOODWAY", "SFHA_TF": "T"}, "floodway"),
    ({"FLD_ZONE": "AE", "ZONE_SUBTY": None, "SFHA_TF": "T"}, "1pct"),
    ({"FLD_ZONE": "VE", "ZONE_SUBTY": None, "SFHA_TF": "T"}, "1pct"),
    ({"FLD_ZONE": "X", "ZONE_SUBTY": "0.2 PCT ANNUAL CHANCE FLOOD HAZARD", "SFHA_TF": "F"}, "0.2pct"),
    ({"FLD_ZONE": "X", "ZONE_SUBTY": "AREA OF MINIMAL FLOOD HAZARD", "SFHA_TF": "F"}, None),
    ({"FLD_ZONE": "OPEN WATER", "ZONE_SUBTY": None, "SFHA_TF": "F"}, None),
])
def test_flood_class(props, expected) -> None:
    assert flood_class(props) == expected


def _feature(geom, **props):
    return {"type": "Feature", "properties": {"FLD_ZONE": "AE", "ZONE_SUBTY": None, "SFHA_TF": "T", **props},
            "geometry": mapping(geom)}


def test_county_zones_are_clipped_dissolved_and_measured() -> None:
    county = box(0, 0, 1, 1)
    features = [
        _feature(box(0, 0, 0.5, 1)),                         # half the county in the 1% zone
        _feature(box(0.4, 0, 0.6, 1), ZONE_SUBTY="FLOODWAY"),  # overlaps the 1% zone
        _feature(box(0.9, 0, 2, 1), FLD_ZONE="X", ZONE_SUBTY="0.2 PCT ANNUAL CHANCE FLOOD HAZARD", SFHA_TF="F"),
        _feature(box(0.8, 0, 0.9, 1), FLD_ZONE="VE"),
    ]
    geo, sfha_pct = build_county(county, features, max_bytes=1_000_000)
    classes = {f["properties"]["class"]: f for f in geo["features"]}
    assert set(classes) == {"floodway", "1pct", "0.2pct"}
    assert classes["1pct"]["properties"]["coastal"] is True
    # 1% ∪ floodway ∪ VE = [0, 0.6] + [0.8, 0.9] = 70% of the county; the 0.2% zone is not counted
    assert sfha_pct == pytest.approx(70.0)
    assert len(json.dumps(geo)) <= 1_000_000


def test_simplifies_until_under_the_size_cap() -> None:
    import math

    county = box(0, 0, 1, 1)
    wiggly = [(0.5 + 0.4 * math.cos(t / 500 * 2 * math.pi) * (1 + 0.01 * (t % 7)),
               0.5 + 0.4 * math.sin(t / 500 * 2 * math.pi)) for t in range(500)]
    from shapely.geometry import Polygon

    geo, _ = build_county(county, [_feature(Polygon(wiggly))], max_bytes=4_000)
    assert len(json.dumps(geo)) <= 4_000


def test_invalid_and_near_duplicate_geometry_still_builds() -> None:
    from shapely.geometry import Polygon

    county = box(0, 0, 1, 1)
    bowtie = Polygon([(0.1, 0.1), (0.9, 0.9), (0.9, 0.1), (0.1, 0.9)])
    sliver = Polygon([(0.2, 0.2), (0.2000001, 0.8), (0.2000002, 0.2)])
    geo, pct = build_county(county, [_feature(bowtie), _feature(sliver)], max_bytes=1_000_000)
    assert 0 <= pct <= 100
    assert geo["features"]
