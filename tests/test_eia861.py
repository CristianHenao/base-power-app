import pandas as pd
import pytest

from pipeline.sources.eia861 import fit_shares, load_zone, slug


def test_fit_shares_matches_county_and_utility_totals() -> None:
    # A serves two counties, B shares the second one.
    pairs = pd.DataFrame(
        {"utility_id": [1, 1, 2], "county_fips": ["48001", "48003", "48003"]}
    )
    utility_totals = pd.Series({1: 150.0, 2: 50.0})
    county_totals = pd.Series({"48001": 100.0, "48003": 100.0})
    out = fit_shares(pairs, utility_totals, county_totals).set_index(["utility_id", "county_fips"])

    assert out.loc[(1, "48001"), "share"] == pytest.approx(1.0)
    assert out.loc[(1, "48003"), "share"] == pytest.approx(0.5, abs=1e-3)
    assert out.loc[(2, "48003"), "share"] == pytest.approx(0.5, abs=1e-3)
    assert out.groupby(level="county_fips")["customers_est"].sum().tolist() == [100, 100]


def test_fit_shares_keeps_utilities_without_an_eia_count() -> None:
    pairs = pd.DataFrame({"utility_id": [1, 9], "county_fips": ["48001", "48001"]})
    out = fit_shares(pairs, pd.Series({1: 80.0}), pd.Series({"48001": 100.0}))
    assert set(out["utility_id"]) == {1, 9}
    assert out["share"].sum() == pytest.approx(1.0)


def test_slug_drops_corporate_suffixes() -> None:
    assert slug("Pedernales Electric Coop, Inc") == "pedernales_electric_coop"
    assert slug("City of Lubbock - (TX)") == "city_of_lubbock"


def test_load_zone_prefers_utility_then_weather_zone() -> None:
    assert load_zone(8901, "ERCOT", "COAST") == "LZ_HOUSTON"
    assert load_zone(1015, "ERCOT", "SCENT") == "LZ_AEN"
    assert load_zone(44372, "ERCOT", "FWEST") == "LZ_WEST"
    assert load_zone(5701, "WECC", "FWEST") is None
