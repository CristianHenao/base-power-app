"""County map layers and utility reliability for the P-04 sales map.

Layers (one value per county, then a 0-1 percentile rank across Texas):
  outages   12h+ outages per typical home per year, from Nolan's outlook (same number as the report)
  weather   mean FEMA NRI risk score across winter weather, ice storm, hurricane, strong wind,
            tornado and heat wave (NRI scores are national percentiles, 0-100)
  flood     the larger of NRI coastal and inland flooding risk scores
  scarcity  hours per year with a real-time price above $1,000/MWh in the county's load zone,
            from Nolan's grid_value.parquet (pipeline.grid_value)
  homes     owner-occupied single-family homes (ACS 5-year, B25032)

Needs pipeline/sources/eia861.py (the map skeleton) and pipeline.grid_value first.
Adds the tables county_layers and utility_reliability to data/features.duckdb;
pipeline/features.py owns the report tables in the same file.

Run: python -m pipeline.map_layers
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import duckdb
import pandas as pd

from pipeline import settings

ROOT = settings.REPO_ROOT
OUTLOOK = ROOT / "data" / "processed" / "outlook.parquet"
NRI_CSV = ROOT / "data" / "raw" / "fema" / "nri_counties_tx.csv"
ACS_DAT = ROOT / "data" / "raw" / "census" / "acsdt5y2024-b25032.dat"
GRID_VALUE = ROOT / "data" / "processed" / "grid_value.parquet"
RELIABILITY_XLSX = ROOT / "data" / "raw" / "eia861" / "Reliability_2024.xlsx"
CROSSWALK = ROOT / "data" / "processed" / "county_utility.csv"
MAP_JSON = ROOT / "public" / "utility-map" / "data" / "utility-map.json"
FEATURES_DB = settings.FEATURES_DUCKDB

WEATHER_HAZARDS = ("WNTW", "ISTM", "HRCN", "SWND", "TRND", "HWAV")
FLOOD_HAZARDS = ("CFLD", "IFLD")
SCARCITY_PRICE = 1000.0  # $/MWh, the threshold pipeline.grid_value counts

LAYER_META = {
    "outages": {"unit": "12h+ outages per typical home per year (estimate)", "as_of": "2025-12-31"},
    "weather": {"unit": "FEMA NRI risk score, 0-100 (winter, ice, hurricane, wind, tornado, heat)",
                "as_of": "2025-12-01"},
    "flood": {"unit": "FEMA NRI flood risk score, 0-100", "as_of": "2025-12-01"},
    "scarcity": {"unit": f"hours per year above ${SCARCITY_PRICE:,.0f}/MWh in the load zone (average)",
                 "as_of": "2025-12-31"},
    "homes": {"unit": "owner-occupied single-family homes (ACS 2020-2024)", "as_of": "2024-12-31"},
}


def nri_layers(path: Path = NRI_CSV) -> pd.DataFrame:
    frame = pd.read_csv(path, dtype={"STCOFIPS": str})
    weather = frame[[f"{code}_RISKS" for code in WEATHER_HAZARDS]].mean(axis=1)
    flood = frame[[f"{code}_RISKS" for code in FLOOD_HAZARDS]].max(axis=1)
    return pd.DataFrame(
        {"weather": weather.round(1).to_numpy(), "flood": flood.round(1).to_numpy()},
        index=frame["STCOFIPS"].str.zfill(5),
    )


def acs_homes(path: Path = ACS_DAT, state_fips: str = "48") -> pd.Series:
    """Owner-occupied 1-unit detached plus attached homes per county."""
    frame = pd.read_csv(path, sep="|", usecols=["GEO_ID", "B25032_E003", "B25032_E004"], dtype={"GEO_ID": str})
    counties = frame.loc[frame["GEO_ID"].str.startswith(f"0500000US{state_fips}")]
    homes = counties["B25032_E003"].astype(int) + counties["B25032_E004"].astype(int)
    return pd.Series(homes.to_numpy(), index=counties["GEO_ID"].str[-5:], name="homes")


def scarcity_hours(grid_value: pd.DataFrame) -> pd.Series:
    """Average hours per year above the scarcity price for each load zone (15-minute intervals / 4)."""
    per_year = grid_value.groupby(["load_zone", "year"])["scarcity_intervals"].sum() / 4
    return per_year.groupby(level="load_zone").mean().round(1)


def percentile_ranks(values: pd.Series) -> pd.Series:
    """0-1 rank with ties at their midpoint. Missing values stay missing."""
    present = values.dropna()
    if len(present) < 2:
        return pd.Series(0.5, index=present.index).reindex(values.index)
    ranks = (present.rank(method="average") - 1) / (len(present) - 1)
    return ranks.round(3).reindex(values.index)


def reliability(path: Path = RELIABILITY_XLSX, state: str = "TX") -> pd.DataFrame:
    """SAIDI and SAIFI with and without major event days, IEEE standard, per utility."""
    frame = pd.read_excel(path, sheet_name="Reliability_States", header=None, skiprows=3)
    frame = frame.loc[frame[3] == state]
    numeric = lambda column: pd.to_numeric(frame[column], errors="coerce")  # noqa: E731
    return pd.DataFrame(
        {
            "utility_id": frame[1].astype(int),
            "utility_name": frame[2].astype(str),
            "saidi_with_med": numeric(5),
            "saifi_with_med": numeric(6),
            "saidi_without_med": numeric(8),
            "saifi_without_med": numeric(9),
            "customers": numeric(14),
        }
    ).dropna(subset=["saidi_with_med"]).reset_index(drop=True)


def county_features(map_counties: list[dict]) -> pd.DataFrame:
    base = pd.DataFrame(
        {"load_zone": [c["load_zone"] for c in map_counties]},
        index=[c["fips"] for c in map_counties],
    )
    outlook = pd.read_parquet(OUTLOOK)
    base["outages"] = outlook["long_outages_per_year"].reindex(base.index).round(3)
    base = base.join(nri_layers())
    base["scarcity"] = base["load_zone"].map(scarcity_hours(pd.read_parquet(GRID_VALUE)))
    base["homes"] = acs_homes().reindex(base.index)
    return base


def main() -> int:
    contract = json.loads(MAP_JSON.read_text())
    features = county_features(contract["counties"])
    layers = [layer["id"] for layer in contract["layers"]]
    ranks = {layer: percentile_ranks(features[layer].astype(float)) for layer in layers}

    for county in contract["counties"]:
        fips = county["fips"]
        county["values"] = {
            layer: (None if pd.isna(features.at[fips, layer]) else float(features.at[fips, layer]))
            for layer in layers
        }
        county["values"]["homes"] = None if pd.isna(features.at[fips, "homes"]) else int(features.at[fips, "homes"])
        county["ranks"] = {layer: (None if pd.isna(ranks[layer][fips]) else float(ranks[layer][fips])) for layer in layers}
    for layer in contract["layers"]:
        layer.update(LAYER_META[layer["id"]])

    shares = pd.read_csv(CROSSWALK, dtype={"county_fips": str})
    shares["homes"] = shares["county_fips"].map(features["homes"]).fillna(0) * shares["share"]
    eligible = shares.groupby("utility")["homes"].sum().round().astype(int)
    for utility in contract["utilities"]:
        utility["eligible_homes"] = int(eligible.get(utility["id"], 0))
    homes_note = " Eligible homes split each county's owner-occupied single-family homes by the estimated utility shares."
    note = contract["note"].replace(" Layer values arrive with ticket A7.", "")
    contract["note"] = note if homes_note in note else note + homes_note
    MAP_JSON.write_text(json.dumps(contract, separators=(",", ":")))

    layers_frame = features.rename_axis("county_fips").reset_index()
    rel = reliability()
    with duckdb.connect(str(FEATURES_DB)) as con:
        con.register("layers_frame", layers_frame)
        con.register("rel", rel)
        con.execute("CREATE OR REPLACE TABLE county_layers AS SELECT * FROM layers_frame")
        con.execute("CREATE OR REPLACE TABLE utility_reliability AS SELECT * FROM rel")
    print(features.describe().round(2).to_string())
    print(f"wrote county_layers ({len(layers_frame)}) and utility_reliability ({len(rel)}) to {FEATURES_DB}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
