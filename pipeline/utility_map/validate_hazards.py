"""Do the hazard layers track real outages? (UM-4.5, PRD v3 §7)

Spearman rank correlation, across Texas counties, between each layer's values and the
long-outage hours per customer (county_outages). A hazard with ρ below 0.1 is marked a
weak link, and the map says so rather than implying it drives grid failures. This is a
screening check across counties, not a causal model.

Run: python -m pipeline.utility_map.validate_hazards  (after the layer builds)
"""
from __future__ import annotations

import json
import sys

import pandas as pd
from scipy import stats

from pipeline import settings

WEAK = 0.1
MIN_COUNTIES = 10
OUT = settings.UTILITY_MAP_DIR / "hazard_validation.json"
TABLES = {
    "flood": ("county_flood.parquet", "value"),
    "tornado": ("county_tornado.parquet", "tornado"),
    "hurricane": ("county_hurricane.parquet", "hurricane"),
    "winter": ("county_winter.parquet", "winter"),
    "heat": ("county_heat.parquet", "heat"),
    "peak_demand": ("county_peak_demand.parquet", "peak_demand"),
}


def outage_links(outages: pd.Series, layers: dict[str, pd.Series], min_counties: int = MIN_COUNTIES) -> dict:
    links = {}
    for layer, values in layers.items():
        both = pd.concat([outages.rename("o"), values.rename("v")], axis=1).dropna()
        if len(both) < max(3, min(min_counties, len(outages))):
            links[layer] = {"rho": None, "n": len(both), "weak": None}
            continue
        rho = float(stats.spearmanr(both["o"], both["v"]).statistic)
        links[layer] = {"rho": round(rho, 3), "n": len(both), "weak": rho < WEAK}
    return links


def main() -> int:
    directory = settings.UTILITY_MAP_DIR
    outages = pd.read_parquet(directory / "county_outages.parquet").set_index("county_fips")
    outages = outages["long_hours_per_customer_year"].where(outages["quality"] == "ok")
    layers = {}
    for layer, (name, column) in TABLES.items():
        if (directory / name).exists():
            layers[layer] = pd.read_parquet(directory / name).set_index("county_fips")[column]
    links = outage_links(outages, layers)
    OUT.write_text(json.dumps(links, indent=2) + "\n")
    for layer, link in links.items():
        print(f"  {layer:<12} ρ = {link['rho']}  (n = {link['n']}){'  weak' if link['weak'] else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
