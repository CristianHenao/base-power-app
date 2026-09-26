import pytest

from pipeline.utility_map.risk_index import (
    HAZARD_LAYERS,
    STRESS_LAYERS,
    attach_risk_index,
    band,
    percentile_1_100,
)

ALL = HAZARD_LAYERS + STRESS_LAYERS + ["homes", "generation", "weather"]


def _county(fips: str, hazard: float, stress: float, **overrides: float | None) -> dict:
    ranks = {layer: hazard for layer in HAZARD_LAYERS} | {layer: stress for layer in STRESS_LAYERS}
    ranks |= {"homes": 0.5, "generation": 0.5, "weather": 0.5}
    ranks |= overrides
    return {"fips": fips, "ranks": ranks}


def _utility(uid: str, weights: list[tuple[str, float]]) -> dict:
    return {"id": uid, "county_weights": [{"fips": f, "customers_est": c, "share": 1.0} for f, c in weights]}


def _release(counties: list[dict], utilities: list[dict]) -> dict:
    return {"counties": counties, "utilities": utilities}


def test_percentiles_run_1_to_100_and_share_ties() -> None:
    assert percentile_1_100([0.1, 0.5, 0.9]) == [1, 51, 100]
    assert percentile_1_100([0.2, 0.2, 0.9]) == [26, 26, 100]
    assert percentile_1_100([None, 0.3, 0.7]) == [None, 1, 100]
    assert percentile_1_100([0.4]) == [50]


def test_bands_are_fifths_of_the_index() -> None:
    assert [band(i) for i in (1, 20, 21, 60, 61, 81, 100)] == [
        (1, "Low"), (1, "Low"), (2, "Moderate"), (3, "Elevated"), (4, "High"), (5, "Severe"), (5, "Severe"),
    ]


def test_county_index_is_half_hazard_half_grid_stress_ranked_across_counties() -> None:
    release = _release(
        [_county("48001", 0.9, 0.9), _county("48003", 0.9, 0.1), _county("48005", 0.1, 0.1)],
        [],
    )
    attach_risk_index(release)
    risks = {c["fips"]: c["risk"] for c in release["counties"]}
    assert risks["48001"]["index"] == 100
    assert risks["48005"]["index"] == 1
    assert risks["48003"]["index"] == 51
    assert risks["48001"]["rank"] == 1 and risks["48001"]["of"] == 3
    assert risks["48003"]["hazard"] == 75  # tied with 48001 on hazard
    assert risks["48003"]["stress"] == 26  # tied with 48005 on stress
    assert risks["48001"]["band"] == "Severe" and risks["48001"]["level"] == 5
    assert risks["48001"]["sources"] == 9 and risks["48001"]["sources_total"] == 9


def test_market_size_generation_and_the_fema_composite_do_not_move_the_index() -> None:
    base = [_county("48001", 0.6, 0.4), _county("48003", 0.4, 0.6)]
    shifted = [_county("48001", 0.6, 0.4, homes=1.0, generation=0.0, weather=1.0),
               _county("48003", 0.4, 0.6, homes=0.0, generation=1.0, weather=0.0)]
    a, b = _release(base, []), _release(shifted, [])
    attach_risk_index(a)
    attach_risk_index(b)
    assert [c["risk"] for c in a["counties"]] == [c["risk"] for c in b["counties"]]


def test_missing_price_spikes_scores_grid_stress_on_the_rest() -> None:
    release = _release(
        [_county("48001", 0.5, 0.8, price_spikes=None), _county("48003", 0.5, 0.2)],
        [],
    )
    attach_risk_index(release)
    outside = release["counties"][0]["risk"]
    assert outside["sources"] == 8
    assert outside["index"] == 100


def test_a_county_with_no_risk_data_has_no_index() -> None:
    empty = _county("48009", 0.5, 0.5, **{layer: None for layer in HAZARD_LAYERS + STRESS_LAYERS})
    release = _release([_county("48001", 0.5, 0.5), empty], [])
    attach_risk_index(release)
    assert release["counties"][1]["risk"]["index"] is None
    assert release["counties"][1]["risk"]["sources"] == 0
    assert release["counties"][0]["risk"]["of"] == 1


def test_utility_index_weights_counties_by_its_own_customers_and_ranks_utilities() -> None:
    release = _release(
        [_county("48001", 0.9, 0.9), _county("48003", 0.1, 0.1), _county("48005", 0.5, 0.5)],
        [
            _utility("mostly_high", [("48001", 900), ("48003", 100)]),
            _utility("mostly_low", [("48001", 100), ("48003", 900)]),
            _utility("middle", [("48005", 1000)]),
        ],
    )
    attach_risk_index(release)
    risk = {u["id"]: u["risk"] for u in release["utilities"]}
    assert risk["mostly_high"]["index"] == 100 and risk["mostly_high"]["rank"] == 1
    assert risk["mostly_low"]["index"] == 1 and risk["mostly_low"]["rank"] == 3
    assert risk["middle"]["index"] == 51
    assert risk["middle"]["of"] == 3
    assert risk["mostly_high"]["sources"] == 9
    assert risk["mostly_high"]["raw"] == pytest.approx(0.82)
