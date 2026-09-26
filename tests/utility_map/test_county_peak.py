import pandas as pd
import pytest

from pipeline.utility_map.county_peak import county_peak_demand


def test_county_peak_splits_each_utility_peak_by_its_customers() -> None:
    grid = pd.DataFrame({"utility_id": [1, 2], "summer_peak_mw": [1000.0, None]})
    crosswalk = pd.DataFrame({
        "county_fips": ["48001", "48003", "48001"],
        "utility_id": [1, 1, 2],
        "customers_est": [750, 250, 100],
    })
    peak = county_peak_demand(grid, crosswalk)
    assert peak["48001"] == pytest.approx(750.0)
    assert peak["48003"] == pytest.approx(250.0)
    # utility 2 has no peak, so it adds nothing rather than pretending zero demand
    assert peak.sum() == pytest.approx(1000.0)


def test_county_with_no_known_peak_is_missing_not_zero() -> None:
    grid = pd.DataFrame({"utility_id": [2], "summer_peak_mw": [None]})
    crosswalk = pd.DataFrame({"county_fips": ["48005"], "utility_id": [2], "customers_est": [10]})
    peak = county_peak_demand(grid, crosswalk)
    assert pd.isna(peak.get("48005"))


def test_a_county_served_only_by_utilities_without_a_peak_is_missing_not_zero() -> None:
    import pandas as pd
    from pipeline.utility_map.county_peak import county_peak_demand
    grid = pd.DataFrame({"utility_id": [1, 2], "summer_peak_mw": [100.0, None]})
    crosswalk = pd.DataFrame({
        "county_fips": ["48083", "48083", "48001"],
        "utility_id": [2, 1, 1],
        "customers_est": [4000, 0, 1000],
    })
    peak = county_peak_demand(grid, crosswalk)
    assert "48083" not in peak.index  # its only customers belong to a utility with no known peak
    assert peak["48001"] == 100.0
