import pandas as pd
import pytest

from pipeline.utility_map.generation import county_generation, fuel_group


@pytest.mark.parametrize("code, group", [("SUN", "solar"), ("WND", "wind"), ("NG", "gas"), ("LIG", "coal"),
                                         ("SUB", "coal"), ("NUC", "nuclear"), ("MWH", "storage"), ("WAT", "other")])
def test_fuel_groups(code, group) -> None:
    assert fuel_group(code) == group


def test_generators_add_up_by_county_and_fuel_with_names_matched_to_fips() -> None:
    generators = pd.DataFrame({
        "Plant Code": [1, 1, 2, 3],
        "State": ["TX", "TX", "TX", "OK"],
        "County": ["Harris", "Harris", "De Witt", "Tulsa"],
        "Summer Capacity (MW)": [100.0, 50.0, 20.0, 999.0],
        "Nameplate Capacity (MW)": [110.0, 55.0, 22.0, 999.0],
        "Energy Source 1": ["NG", "SUN", "WND", "NG"],
    })
    names = pd.DataFrame({"county_fips": ["48201", "48123"], "county": ["Harris", "DeWitt"]})
    out = county_generation(generators, names).set_index("county_fips")
    assert out.at["48201", "summer_mw"] == 150.0
    assert out.at["48201", "gas_mw"] == 100.0
    assert out.at["48201", "solar_mw"] == 50.0
    assert out.at["48123", "wind_mw"] == 20.0
    assert "Tulsa" not in out.index


def test_unmatched_texas_county_names_fail_loudly() -> None:
    generators = pd.DataFrame({"Plant Code": [1], "State": ["TX"], "County": ["Atlantis"],
                               "Summer Capacity (MW)": [1.0], "Nameplate Capacity (MW)": [1.0], "Energy Source 1": ["NG"]})
    with pytest.raises(ValueError, match="Atlantis"):
        county_generation(generators, pd.DataFrame({"county_fips": ["48201"], "county": ["Harris"]}))
