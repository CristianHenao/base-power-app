"""County summer peak demand, estimated from each utility's peak (UM-1.3).

A county's peak = Σ over its utilities of (utility summer peak × the utility's estimated
customers in the county ÷ the utility's estimated customers everywhere). Utilities with no
known peak add nothing; a county none of whose utilities has a peak stays missing.

Run: python -m pipeline.utility_map.county_peak  (after eia_grid and ercot_load)
"""
from __future__ import annotations

import sys

import pandas as pd

from pipeline import settings

OUT = settings.UTILITY_MAP_DIR / "county_peak_demand.parquet"


def county_peak_demand(grid: pd.DataFrame, crosswalk: pd.DataFrame) -> pd.Series:
    pairs = crosswalk[["county_fips", "utility_id", "customers_est"]].merge(
        grid[["utility_id", "summer_peak_mw"]], on="utility_id", how="left"
    )
    pairs = pairs.dropna(subset=["summer_peak_mw"])
    totals = pairs.groupby("utility_id")["customers_est"].transform("sum")
    pairs["mw"] = pairs["summer_peak_mw"] * pairs["customers_est"] / totals
    return pairs.groupby("county_fips")["mw"].sum().rename("peak_demand")


def main() -> int:
    grid = pd.read_parquet(settings.UTILITY_MAP_DIR / "utility_grid.parquet")
    crosswalk = pd.read_csv(settings.COUNTY_UTILITY_CSV, dtype={"county_fips": str})
    peak = county_peak_demand(grid, crosswalk).round(1)
    peak.rename_axis("county_fips").reset_index().to_parquet(OUT, index=False)
    print(f"wrote {OUT}: {len(peak)} counties, total {peak.sum():,.0f} MW")
    print(peak.sort_values(ascending=False).head(5).to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main())
