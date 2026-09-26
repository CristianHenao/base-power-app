import numpy as np
import pandas as pd
import pytest

from pipeline.household_gap import GRID_HOURS, expected_excess, gap, outage_weights, quantile_from_survival, survival_at

EXPONENTIAL = np.exp(-GRID_HOURS / 10.0)  # mean 10 hours


@pytest.mark.parametrize("backup", [0.0, 5.0, 12.0, 30.0])
def test_expected_excess_matches_the_exponential_formula(backup):
    assert expected_excess(EXPONENTIAL, backup) == pytest.approx(10.0 * np.exp(-backup / 10.0), rel=0.02)


def test_survival_and_quantiles_invert_each_other():
    assert survival_at(EXPONENTIAL, 10.0) == pytest.approx(np.exp(-1.0), rel=0.01)
    assert quantile_from_survival(EXPONENTIAL, 0.5) == pytest.approx(10.0 * np.log(2.0), rel=0.02)


def test_gap_adds_seasons_and_a_bigger_backup_never_hurts():
    seasons = [{"season": "winter", "outages_per_year": 0.5, "survival": EXPONENTIAL.tolist()},
               {"season": "summer", "outages_per_year": 1.0, "survival": EXPONENTIAL.tolist()}]
    none, _ = gap(seasons, {"winter": 0.0, "summer": 0.0})
    one, chance_one = gap(seasons, {"winter": 20.0, "summer": 15.0})
    two, chance_two = gap(seasons, {"winter": 40.0, "summer": 30.0})
    assert none == pytest.approx(15.0, rel=0.02)
    assert none > one > two >= 0.0 and 1.0 > chance_one > chance_two > 0.0


def test_outage_weights_sum_to_the_shrunk_county_rate():
    events = pd.DataFrame({"county_fips": ["1", "1", "2"], "peak_out": [100.0, 300.0, 50.0], "customers": 1000.0})
    years = pd.Series({"1": 4.0, "2": 4.0})
    zones = pd.Series({"1": "Z", "2": "Z"})
    out = outage_weights(events, years, zones)
    assert (out["weight_lo"] <= out["weight"]).all() and (out["weight"] <= out["weight_hi"]).all()
    raw_1 = (100 + 300) / 1000 / 4
    assert 0 < out.loc[out.county_fips == "1", "weight"].sum() and abs(out.loc[out.county_fips == "1", "weight"].sum() - raw_1) < raw_1
