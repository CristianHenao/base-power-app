"""EIA-861 county -> utility crosswalk and the real P-04 map skeleton.

EIA-861 lists which counties each utility serves (Service_Territory) and each
utility's customers in the state (Sales_Ult_Cust for bundled utilities,
Delivery_Companies for the wires companies in the competitive market). It does
not say how a county's customers split between utilities. We estimate that split
with iterative proportional fitting over the utility-county pairs EIA lists, so
each county sums to its EAGLE-I modeled customers and each utility to its EIA total.

Retail providers (Base itself, TXU, Reliant) report energy-only rows. They sell on
top of the wires utility, so they are left out to avoid counting homes twice.

Run: python -m pipeline.sources.eia861
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import yaml
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from pipeline import settings
from pipeline.sources.eaglei import load_customers

RAW_DIR = settings.REPO_ROOT / "data" / "raw" / "eia861"
YEAR = 2024
COUNTY_SHAPES = settings.REPO_ROOT / "data" / "raw" / "us-counties-20m.json"
WEATHER_ZONES = settings.REPO_ROOT / "data" / "processed" / "county_weather_zone.csv"
BASE_YAML = settings.REPO_ROOT / "data" / "reference" / "base_availability.yaml"
CROSSWALK_CSV = settings.REPO_ROOT / "data" / "processed" / "county_utility.csv"
MAP_DIR = settings.REPO_ROOT / "public" / "utility-map" / "data"

GRID_BY_BA = {"ERCO": "ERCOT", "SWPP": "SPP", "MISO": "MISO"}  # anything else in Texas is WECC (El Paso)

# ERCOT does not publish county -> load zone. Utilities that are their own zone win,
# then the weather zone decides among the four big zones. LZ_LCRA and LZ_RAYBN are
# co-op zones we do not try to place. Labeled approximate on the map.
LOAD_ZONE_BY_UTILITY = {8901: "LZ_HOUSTON", 1015: "LZ_AEN", 16604: "LZ_CPS"}
LOAD_ZONE_BY_WEATHER = {
    "COAST": "LZ_HOUSTON",
    "EAST": "LZ_NORTH",
    "NCENT": "LZ_NORTH",
    "NORTH": "LZ_NORTH",
    "SCENT": "LZ_SOUTH",
    "SOUTH": "LZ_SOUTH",
    "WEST": "LZ_WEST",
    "FWEST": "LZ_WEST",
}


def _customers_frame(path: Path, sheet: str | int = 0) -> pd.DataFrame:
    """Utility number, name, BA code and total customers from a Sales-style sheet."""
    frame = pd.read_excel(path, sheet_name=sheet, header=2)
    frame.columns = [str(column).split("\n")[0].strip() for column in frame.columns]
    # The last "Count" column is TOTAL customers across all classes.
    count_col = [column for column in frame.columns if column.startswith("Count")][-1]
    frame = frame.loc[frame["State"] == "TX"]
    return pd.DataFrame(
        {
            "utility_id": frame["Utility Number"].astype(int),
            "utility_name": frame["Utility Name"].astype(str),
            "ba_code": frame["BA Code"].astype(str),
            "customers": pd.to_numeric(frame[count_col], errors="coerce").fillna(0.0),
        }
    )


def read_utilities(raw_dir: Path = RAW_DIR, year: int = YEAR) -> pd.DataFrame:
    """Texas wires utilities with total customers and grid."""
    bundled = _customers_frame(raw_dir / f"Sales_Ult_Cust_{year}.xlsx", "States")
    delivery = _customers_frame(raw_dir / f"Delivery_Companies_{year}.xlsx")
    frame = pd.concat([bundled, delivery], ignore_index=True)
    frame = frame.groupby("utility_id", as_index=False).agg(
        utility_name=("utility_name", "first"),
        ba_code=("ba_code", "first"),
        customers=("customers", "sum"),
    )
    frame["grid"] = frame["ba_code"].map(GRID_BY_BA).fillna("WECC")
    return frame


def read_territory(raw_dir: Path, names: pd.DataFrame, year: int = YEAR) -> pd.DataFrame:
    """Utility-county pairs in Texas with 5-digit FIPS, matched by county name."""
    frame = pd.read_excel(raw_dir / f"Service_Territory_{year}.xlsx", sheet_name="Counties_States")
    frame = frame.loc[frame["State"] == "TX"]
    key = names.assign(match=names["county"].map(_county_key))
    pairs = pd.DataFrame(
        {
            "utility_id": frame["Utility Number"].astype(int),
            "utility_name": frame["Utility Name"].astype(str),
            "match": frame["County"].astype(str).map(_county_key),
        }
    )
    pairs = pairs.merge(key[["match", "county_fips"]], on="match", how="left")
    missing = sorted(pairs.loc[pairs["county_fips"].isna(), "match"].unique())
    if missing:
        raise ValueError(f"EIA county names with no FIPS match: {', '.join(missing)}")
    return pairs.drop(columns="match").drop_duplicates(["utility_id", "county_fips"])


def _county_key(name: str) -> str:
    return re.sub(r"[^a-z]", "", name.lower().replace(" county", ""))


def fit_shares(
    pairs: pd.DataFrame,
    utility_totals: pd.Series,
    county_totals: pd.Series,
    iterations: int = 200,
) -> pd.DataFrame:
    """Estimate customers per utility-county pair by iterative proportional fitting.

    Utilities without an EIA customer count get the median, so they still show up.
    Utility totals are rescaled to the county grand total before fitting.
    """
    pairs = pairs[["utility_id", "county_fips"]].copy()
    rows = utility_totals.reindex(pairs["utility_id"].unique())
    rows = rows.fillna(rows.median() if rows.notna().any() else 1.0).clip(lower=1.0)
    cols = county_totals.reindex(pairs["county_fips"].unique()).fillna(1.0).clip(lower=1.0)
    rows = rows * cols.sum() / rows.sum()

    pairs["value"] = 1.0
    for _ in range(iterations):
        by_utility = pairs.groupby("utility_id")["value"].transform("sum")
        pairs["value"] *= pairs["utility_id"].map(rows) / by_utility
        by_county = pairs.groupby("county_fips")["value"].transform("sum")
        pairs["value"] *= pairs["county_fips"].map(cols) / by_county

    pairs["share"] = pairs["value"] / pairs.groupby("county_fips")["value"].transform("sum")
    pairs["customers_est"] = pairs["value"].round().astype(int)
    return pairs.drop(columns="value")


def slug(name: str) -> str:
    text = re.sub(r"\b(inc|llc|co|company|corp|assn)\b\.?", "", name.lower())
    text = re.sub(r"-\s*\(tx\)", "", text)
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


def load_zone(primary_utility: int, grid: str, weather_zone: str) -> str | None:
    if grid != "ERCOT":
        return None
    return LOAD_ZONE_BY_UTILITY.get(primary_utility) or LOAD_ZONE_BY_WEATHER.get(weather_zone)


def _texas_features(path: Path) -> list[dict]:
    features = json.loads(path.read_text())["features"]
    return [feature for feature in features if str(feature["id"]).zfill(5).startswith("48")]


def territories(features: list[dict], counties_by_utility: dict[str, list[str]]) -> dict:
    """Dissolve county shapes into one outline per utility. Outlines overlap where utilities share a county."""
    shapes = {str(feature["id"]).zfill(5): shape(feature["geometry"]) for feature in features}
    out = []
    for uid, fips_list in counties_by_utility.items():
        merged = unary_union([shapes[fips].buffer(0.01) for fips in fips_list]).buffer(-0.01)
        merged = merged.simplify(0.005, preserve_topology=True)
        out.append({"type": "Feature", "properties": {"utility": uid}, "geometry": mapping(merged)})
    return {"type": "FeatureCollection", "features": out}


def build(raw_dir: Path = RAW_DIR) -> tuple[pd.DataFrame, dict, dict, dict]:
    zones = pd.read_csv(WEATHER_ZONES, dtype={"county_fips": str})
    utilities = read_utilities(raw_dir)
    pairs = read_territory(raw_dir, zones[["county_fips", "county"]])
    county_customers = pd.Series(load_customers(settings.CUSTOMERS_CSV))
    shares = fit_shares(pairs, utilities.set_index("utility_id")["customers"], county_customers)

    base = yaml.safe_load(BASE_YAML.read_text())
    base_by_id = {row["eia_utility_id"]: row for row in base["utilities"] if "eia_utility_id" in row}

    names = pairs.drop_duplicates("utility_id").set_index("utility_id")["utility_name"]
    info = utilities.set_index("utility_id")
    ids = {
        uid: base_by_id[uid]["key"] if uid in base_by_id else slug(names[uid])
        for uid in shares["utility_id"].unique()
    }

    crosswalk = shares.assign(
        utility=shares["utility_id"].map(ids),
        utility_name=shares["utility_id"].map(names),
        grid=shares["utility_id"].map(info["grid"]).fillna("ERCOT"),
    ).sort_values(["county_fips", "share"], ascending=[True, False])
    crosswalk["primary"] = ~crosswalk.duplicated("county_fips")

    features = _texas_features(COUNTY_SHAPES)
    shapes = {str(feature["id"]).zfill(5): shape(feature["geometry"]) for feature in features}
    zone_by_fips = zones.set_index("county_fips")

    counties = []
    for fips, part in crosswalk.groupby("county_fips", sort=True):
        primary = part.iloc[0]
        point = shapes[fips].representative_point()
        counties.append(
            {
                "fips": fips,
                "name": zone_by_fips.loc[fips, "county"],
                "utilities": part["utility"].tolist(),
                "customers": int(county_customers.get(fips, 0)),
                "load_zone": load_zone(
                    int(primary["utility_id"]), primary["grid"], zone_by_fips.loc[fips, "weather_zone"]
                ),
                "centroid": [round(point.x, 4), round(point.y, 4)],
                "values": dict.fromkeys(LAYER_IDS),
                "ranks": dict.fromkeys(LAYER_IDS),
            }
        )

    utility_rows = []
    counties_by_utility: dict[str, list[str]] = {}
    for uid, part in crosswalk.groupby("utility_id"):
        key = ids[uid]
        biggest = part.sort_values("customers_est", ascending=False).iloc[0]["county_fips"]
        point = shapes[biggest].representative_point()
        offer = base_by_id.get(uid, {}).get("offer", "none")
        counties_by_utility[key] = sorted(part["county_fips"])
        utility_rows.append(
            {
                "id": key,
                "eia_utility_id": int(uid),
                "name": base_by_id.get(uid, {}).get("name", names[uid]),
                "grid": part["grid"].iloc[0],
                "scored": offer != "none",
                "base_offer": offer,
                "counties": counties_by_utility[key],
                "customers": int(info["customers"].get(uid, part["customers_est"].sum())),
                "eligible_homes": None,
                "label_point": [round(point.x, 4), round(point.y, 4)],
                "core_coverage_hours": None,
            }
        )
    utility_rows.sort(key=lambda row: -row["customers"])

    county_geo = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": int(fips),
                "properties": {"fips": fips, "name": zone_by_fips.loc[fips, "county"]},
                "geometry": mapping(shapes[fips]),
            }
            for fips in sorted(shapes)
        ],
    }
    contract = {
        "mock": False,
        "as_of": pd.Timestamp.now(tz="America/Chicago").date().isoformat(),
        "note": (
            "Utilities, territories and customers from EIA-861 2024. County customer splits "
            "between utilities are estimates. Territories are whole counties merged, so they "
            "overlap where utilities share a county. Load zones are approximate. "
            "Layer values arrive with ticket A7."
        ),
        "layers": LAYERS,
        "presets": PRESETS,
        "battery": {"kwh_per_core": 39.2, "kw_per_core": 20},
        "live": {"as_of": None, "ercot": None, "alerts": []},
        "counties": counties,
        "utilities": utility_rows,
        "geometry": {"counties": "counties.geojson", "territories": "territories.geojson"},
    }
    return crosswalk, contract, county_geo, territories(features, counties_by_utility)


LAYERS = [
    {"id": "outages", "label": "Outage history", "unit": "long-outage hours per customer per year",
     "source": "eaglei", "as_of": None},
    {"id": "weather", "label": "Weather hazard", "unit": "hazard index, 0-100",
     "source": "fema_nri", "as_of": None},
    {"id": "flood", "label": "Flood", "unit": "flood index, 0-100", "source": "fema_nri", "as_of": None},
    {"id": "scarcity", "label": "Grid scarcity", "unit": "scarcity hours per year in the load zone",
     "source": "ercot_rtm", "as_of": None},
    {"id": "homes", "label": "Homes exposed", "unit": "owner-occupied single-family homes",
     "source": "acs_5yr", "as_of": None},
]
LAYER_IDS = [layer["id"] for layer in LAYERS]
PRESETS = [
    {"id": "winter", "label": "Winter freeze", "layers": ["outages", "weather", "homes"]},
    {"id": "hurricane", "label": "Hurricane season", "layers": ["outages", "weather", "flood", "homes"]},
    {"id": "summer", "label": "Summer peak", "layers": ["scarcity", "weather", "homes"]},
]


def main() -> int:
    crosswalk, contract, county_geo, territory_geo = build()
    CROSSWALK_CSV.parent.mkdir(parents=True, exist_ok=True)
    crosswalk[
        ["county_fips", "utility_id", "utility", "utility_name", "grid", "share", "customers_est", "primary"]
    ].to_csv(CROSSWALK_CSV, index=False, float_format="%.4f")
    MAP_DIR.mkdir(parents=True, exist_ok=True)
    compact = {"separators": (",", ":")}
    (MAP_DIR / "utility-map.json").write_text(json.dumps(contract, **compact))
    (MAP_DIR / "counties.geojson").write_text(json.dumps(county_geo, **compact))
    (MAP_DIR / "territories.geojson").write_text(json.dumps(territory_geo, **compact))
    print(f"{len(crosswalk)} utility-county pairs, {crosswalk['utility_id'].nunique()} utilities")
    for row in contract["utilities"][:12]:
        print(f"  {row['name'][:34]:<34} {row['grid']:<5} {len(row['counties']):>3} counties "
              f"{row['customers']:>10,}  {row['base_offer']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
