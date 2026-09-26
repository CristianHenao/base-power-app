import json
from pathlib import Path

import pandas as pd
import pytest

from pipeline.utility_map import assemble

LAYER_IDS = [layer["id"] for layer in assemble.LAYERS]


def _crosswalk() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "county_fips": ["48001", "48001", "48003"],
            "utility_id": [1, 2, 1],
            "utility": ["alpha", "beta", "alpha"],
            "grid": ["ERCOT", "SPP", "ERCOT"],
            "share": [0.8, 0.2, 1.0],
            "customers_est": [800, 200, 500],
        }
    )


def _v1() -> dict:
    county = lambda fips, zone, scarcity: {  # noqa: E731
        "fips": fips, "name": fips, "utilities": ["alpha"], "customers": 1000, "load_zone": zone,
        "centroid": [-97.0, 31.0],
        "values": {"outages": 0.2, "weather": 50.0, "flood": 40.0, "scarcity": scarcity, "homes": 100},
        "ranks": {"outages": 0.5, "weather": 0.5, "flood": 0.5, "scarcity": None if scarcity is None else 0.5,
                  "homes": 0.5},
    }
    return {
        "mock": False, "as_of": "2026-09-26", "note": "n",
        "layers": [{"id": i, "label": i, "unit": "u", "source": "s", "as_of": "2025-12-31"}
                   for i in ["outages", "weather", "flood", "scarcity", "homes"]],
        "presets": [], "battery": {"kwh_per_core": 39.2, "kw_per_core": 20},
        "live": {"as_of": None, "ercot": None, "alerts": []},
        "counties": [county("48001", "LZ_NORTH", 12.0), county("48003", None, None)],
        "utilities": [
            {"id": "alpha", "eia_utility_id": 1, "name": "Alpha", "grid": "ERCOT", "scored": True,
             "base_offer": "energy_plus_backup", "counties": ["48001", "48003"], "customers": 1300,
             "eligible_homes": 180, "label_point": [-97.0, 31.0], "core_coverage_hours": None},
            {"id": "beta", "eia_utility_id": 2, "name": "Beta", "grid": "SPP", "scored": False,
             "base_offer": "none", "counties": ["48001"], "customers": 200,
             "eligible_homes": 20, "label_point": [-97.0, 31.0], "core_coverage_hours": None},
        ],
        "geometry": {"counties": "counties.geojson", "territories": "territories.geojson"},
    }


OFFERS = {1: "energy_plus_backup", 3: "unconfirmed"}


def test_county_weights_carry_each_utilitys_share() -> None:
    weights = assemble.county_weights(_crosswalk())
    assert weights["alpha"] == [
        {"fips": "48001", "customers_est": 800, "share": 0.8},
        {"fips": "48003", "customers_est": 500, "share": 1.0},
    ]
    assert weights["beta"] == [{"fips": "48001", "customers_est": 200, "share": 0.2}]


def test_offer_is_null_and_unverified_when_not_listed() -> None:
    assert assemble.offer_for(1, OFFERS) == ("energy_plus_backup", "listed")
    assert assemble.offer_for(2, OFFERS) == (None, "unverified")
    assert assemble.offer_for(3, OFFERS) == (None, "unverified")


def test_scarcity_becomes_price_spikes_and_every_layer_key_exists() -> None:
    release = assemble.upgrade(_v1(), _crosswalk(), OFFERS)
    county = release["counties"][0]
    assert "scarcity" not in county["values"]
    assert county["values"]["price_spikes"] == 12.0
    assert set(county["values"]) == set(LAYER_IDS) == set(county["ranks"]) == set(county["quality"])


def test_price_spikes_not_applicable_outside_ercot_and_unbuilt_layers_missing() -> None:
    release = assemble.upgrade(_v1(), _crosswalk(), OFFERS)
    outside = release["counties"][1]
    assert outside["quality"]["price_spikes"] == "not_applicable"
    assert outside["quality"]["outages"] == "ok"
    assert outside["quality"]["tornado"] == "missing"
    assert outside["values"]["tornado"] is None


def test_county_grid_status_reflects_every_serving_utility() -> None:
    release = assemble.upgrade(_v1(), _crosswalk(), OFFERS)
    by_fips = {c["fips"]: c for c in release["counties"]}
    assert by_fips["48001"]["grid_status"] == "mixed"
    assert by_fips["48003"]["grid_status"] == "ercot"
    assert by_fips["48001"]["utilities"] == ["alpha", "beta"]


def test_utilities_get_weights_offer_and_all_are_scored() -> None:
    release = assemble.upgrade(_v1(), _crosswalk(), OFFERS)
    beta = next(u for u in release["utilities"] if u["id"] == "beta")
    assert beta["base_offer"] is None
    assert beta["offer_verification"] == "unverified"
    assert beta["scored"] is True
    assert beta["county_weights"] == [{"fips": "48001", "customers_est": 200, "share": 0.2}]


def test_layers_report_availability_and_counts() -> None:
    release = assemble.upgrade(_v1(), _crosswalk(), OFFERS)
    layers = {layer["id"]: layer for layer in release["layers"]}
    assert layers["outages"]["available"] is True
    assert layers["tornado"]["available"] is False
    assert layers["tornado"]["unavailable_reason"]
    assert layers["price_spikes"]["coverage"] == {"ok": 1, "missing": 0, "not_applicable": 1}
    assert {layer["group"] for layer in release["layers"]} == {"grid", "hazard", "exposure"}


def test_root_fields_and_live_status() -> None:
    release = assemble.upgrade(_v1(), _crosswalk(), OFFERS)
    assert release["schema_version"] == "3.0"
    assert release["data_mode"] == "partial"
    assert release["mock"] is False
    assert release["live"]["status"] == "unavailable"
    assert release["battery"]["reserve_fraction"] == 0.2
    assert [p["id"] for p in release["presets"]] == ["winter", "hurricane", "summer", "storms", "all_hazards"]


def test_release_id_depends_only_on_content() -> None:
    a = assemble.upgrade(_v1(), _crosswalk(), OFFERS)
    b = assemble.upgrade(_v1(), _crosswalk(), OFFERS)
    assert assemble.release_id(a, "2026-09-26") == assemble.release_id(b, "2026-09-26")
    b["counties"][0]["values"]["outages"] = 0.3
    assert assemble.release_id(a, "2026-09-26") != assemble.release_id(b, "2026-09-26")


def test_check_rejects_nan_and_bad_shares() -> None:
    release = assemble.upgrade(_v1(), _crosswalk(), OFFERS)
    assert assemble.check(release, expected_counties=2) == []
    release["counties"][0]["values"]["outages"] = float("nan")
    release["utilities"][0]["county_weights"][0]["share"] = 0.5
    problems = assemble.check(release, expected_counties=2)
    assert any("finite" in p for p in problems)
    assert any("48001" in p and "share" in p for p in problems)


def test_publish_writes_release_and_pointer(tmp_path: Path) -> None:
    release = assemble.upgrade(_v1(), _crosswalk(), OFFERS)
    geo = tmp_path / "src"
    geo.mkdir()
    (geo / "counties.geojson").write_text('{"type":"FeatureCollection","features":[]}')
    (geo / "territories.geojson").write_text('{"type":"FeatureCollection","features":[]}')
    out = tmp_path / "public"
    rid = assemble.publish(release, geo, out, today="2026-09-26", expected_counties=2)
    folder = out / "releases" / rid
    assert json.loads((folder / "utility-map.json").read_text())["release_id"] == rid
    assert (folder / "counties.geojson").exists() and (folder / "territories.geojson").exists()
    assert json.loads((out / "current.json").read_text()) == {
        "release_id": rid, "path": f"releases/{rid}", "schema_version": "3.0"}


def test_publish_refuses_a_release_that_fails_checks(tmp_path: Path) -> None:
    release = assemble.upgrade(_v1(), _crosswalk(), OFFERS)
    release["counties"].pop()
    with pytest.raises(ValueError, match="254"):
        assemble.publish(release, tmp_path, tmp_path / "public", today="2026-09-26", expected_counties=254)
    assert not (tmp_path / "public" / "current.json").exists()


def test_lens_adds_the_fema_stand_in_while_any_requested_hazard_is_missing() -> None:
    release = assemble.upgrade(_v1(), _crosswalk(), OFFERS)
    lenses = {p["id"]: p for p in release["presets"]}
    assert lenses["all_hazards"]["layers"] == ["flood", "weather"]
    assert lenses["hurricane"]["layers"] == ["flood", "outages", "homes", "weather"]
    assert lenses["hurricane"]["requested"] == ["hurricane", "flood", "outages", "homes"]


def test_extra_county_tables_become_available_ranked_layers() -> None:
    tables = {"peak_demand": pd.Series({"48001": 500.0, "48003": 100.0})}
    release = assemble.upgrade(_v1(), _crosswalk(), OFFERS, tables=tables)
    layers = {layer["id"]: layer for layer in release["layers"]}
    assert layers["peak_demand"]["available"] is True
    assert layers["peak_demand"]["unit"]
    by_fips = {c["fips"]: c for c in release["counties"]}
    assert by_fips["48001"]["values"]["peak_demand"] == 500.0
    assert by_fips["48001"]["ranks"]["peak_demand"] == 1.0
    assert by_fips["48003"]["ranks"]["peak_demand"] == 0.0
    assert by_fips["48003"]["quality"]["peak_demand"] == "ok"
    assert assemble.check(release, expected_counties=2) == []


def test_utilities_carry_their_grid_numbers() -> None:
    grid = pd.DataFrame({"utility_id": [1], "summer_peak_mw": [900.0], "winter_peak_mw": [800.0],
                         "sales_mwh": [5e6], "residential_mwh": [2e6], "peak_source": ["eia861"]})
    release = assemble.upgrade(_v1(), _crosswalk(), OFFERS, utility_grid=grid)
    alpha, beta = release["utilities"]
    assert alpha["grid_stats"] == {"summer_peak_mw": 900.0, "winter_peak_mw": 800.0, "sales_mwh": 5e6,
                                   "residential_mwh": 2e6, "peak_source": "eia861"}
    assert beta["grid_stats"] is None


def test_a_table_replaces_a_phase0_layer_and_county_fields_are_attached() -> None:
    tables = {"outages": pd.Series({"48001": 13.0, "48003": None})}
    fields = {"outage_coverage_12h": pd.Series({"48001": 0.16})}
    release = assemble.upgrade(_v1(), _crosswalk(), OFFERS, tables=tables, county_fields=fields)
    by_fips = {c["fips"]: c for c in release["counties"]}
    assert by_fips["48001"]["values"]["outages"] == 13.0
    assert by_fips["48003"]["values"]["outages"] is None
    assert by_fips["48003"]["quality"]["outages"] == "missing"
    assert by_fips["48001"]["outage_coverage_12h"] == 0.16
    assert by_fips["48003"]["outage_coverage_12h"] is None
    layers = {layer["id"]: layer for layer in release["layers"]}
    assert "12 hours or more" in layers["outages"]["unit"]
