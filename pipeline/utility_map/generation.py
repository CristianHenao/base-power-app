"""Local generation by county from EIA-860 2024 (UM-1.4).

Source: https://www.eia.gov/electricity/data/eia860/ (archive/xls/eia8602024.zip),
3_1_Generator_Y2024.xlsx sheet Operable and 2___Plant_Y2024.xlsx for plant locations.
The layer value is net summer capacity (MW), the figure EIA uses for Texas's statewide
total; nameplate is kept alongside. County names join to FIPS the same way as the
EIA-861 crosswalk; an unmatched Texas county name fails the build.

Generation inside a county is not reserved for it: ERCOT is one connected grid.

Run: python -m pipeline.utility_map.generation
"""
from __future__ import annotations

import json
import sys

import pandas as pd

from pipeline import settings
from pipeline.sources.eia861 import _county_key
from pipeline.utility_map.manifest import record

URL = "https://www.eia.gov/electricity/data/eia860/archive/xls/eia8602024.zip"
RAW = settings.RAW_DIR / "eia860"
FUELS = {"SUN": "solar", "WND": "wind", "NG": "gas", "NUC": "nuclear", "MWH": "storage",
         "BIT": "coal", "SUB": "coal", "LIG": "coal", "RC": "coal", "WC": "coal"}
GROUPS = ("solar", "wind", "gas", "coal", "nuclear", "storage", "other")


def fuel_group(code: str) -> str:
    return FUELS.get(str(code).strip(), "other")


def county_generation(generators: pd.DataFrame, names: pd.DataFrame) -> pd.DataFrame:
    tx = generators.loc[generators["State"] == "TX"].copy()
    lookup = {_county_key(n): f for f, n in zip(names["county_fips"], names["county"])}
    tx["county_fips"] = tx["County"].astype(str).map(_county_key).map(lookup)
    missing = sorted(tx.loc[tx["county_fips"].isna(), "County"].astype(str).unique())
    if missing:
        raise ValueError(f"EIA-860 Texas county names with no FIPS match: {', '.join(missing)}")
    tx["fuel"] = tx["Energy Source 1"].map(fuel_group)
    summer = pd.to_numeric(tx["Summer Capacity (MW)"], errors="coerce").fillna(0.0)
    tx = tx.assign(summer=summer, nameplate=pd.to_numeric(tx["Nameplate Capacity (MW)"], errors="coerce").fillna(0.0))
    out = tx.groupby("county_fips").agg(summer_mw=("summer", "sum"), nameplate_mw=("nameplate", "sum"))
    by_fuel = tx.pivot_table(index="county_fips", columns="fuel", values="summer", aggfunc="sum", fill_value=0.0)
    for group in GROUPS:
        out[f"{group}_mw"] = by_fuel[group] if group in by_fuel else 0.0
    return out.reset_index()


def main() -> int:
    generators = pd.read_excel(RAW / "3_1_Generator_Y2024.xlsx", sheet_name="Operable", header=1)
    plants = pd.read_excel(RAW / "2___Plant_Y2024.xlsx", header=1)
    names = pd.read_csv(settings.COUNTY_WEATHER_ZONE_CSV, dtype={"county_fips": str})[["county_fips", "county"]]
    table = county_generation(generators, names)
    table = names[["county_fips"]].merge(table, on="county_fips", how="left").fillna(0.0)  # no plants = 0 MW
    table.round(1).to_parquet(settings.UTILITY_MAP_DIR / "county_generation.parquet", index=False)

    tx = generators.loc[generators["State"] == "TX"].assign(fuel=lambda f: f["Energy Source 1"].map(fuel_group))
    tx["summer"] = pd.to_numeric(tx["Summer Capacity (MW)"], errors="coerce").fillna(0.0)
    per_plant = tx.groupby("Plant Code").agg(mw=("summer", "sum"), fuel=("fuel", lambda s: s.mode().iat[0]))
    located = per_plant.join(plants.set_index("Plant Code")[["Plant Name", "Latitude", "Longitude"]], how="inner")
    features = [
        {"type": "Feature", "properties": {"name": r["Plant Name"], "mw": round(float(r.mw), 1), "fuel": r.fuel},
         "geometry": {"type": "Point", "coordinates": [round(float(r.Longitude), 4), round(float(r.Latitude), 4)]}}
        for _, r in located.iterrows() if r.mw > 0 and pd.notna(r.Latitude)
    ]
    out = settings.UTILITY_MAP_DIR / "hazards" / "generators.geojson"
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))
    record("eia860_generators", URL, RAW / "3_1_Generator_Y2024.xlsx", RAW / "2___Plant_Y2024.xlsx",
           rows=len(tx), period_start="2024-01-01", period_end="2024-12-31",
           note="Operable generators, Texas; net summer capacity by county and fuel.")
    print(f"Texas operable net summer capacity {table['summer_mw'].sum():,.0f} MW, nameplate "
          f"{table['nameplate_mw'].sum():,.0f} MW; {len(features)} plants; file {out.stat().st_size / 1e6:.2f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
