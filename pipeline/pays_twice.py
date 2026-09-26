"""Where a Core pays twice: homeowner backup value times grid value, per Texas county.

Run: python -m pipeline.pays_twice   (after pipeline.features and pipeline.map_layers)

Homeowner value is expected 12-hour-plus outages per year across the county's
owner-occupied single-family homes (outlook rate x ACS homes). Grid value is the mean
perfect-foresight arbitrage for one Core in the county's ERCOT load zone, 2021-2025, an
upper bound. The index is the geometric mean of the two percentile ranks, so a county
needs both. Counties outside ERCOT have no grid value and no index.
Writes the pays_twice table to data/features.duckdb and data/processed/pays_twice.csv.
"""
from __future__ import annotations

import sys

import duckdb
import numpy as np
import pandas as pd

from pipeline import settings
from pipeline.reports import base_offer

GRID_YEARS = (2021, 2025)
TOP_N = 10


def ranks(values: pd.Series) -> pd.Series:
    """0-1 percentile rank, ties at their midpoint; missing stays missing."""
    present = values.dropna()
    if len(present) < 2:
        return pd.Series(0.5, index=present.index).reindex(values.index)
    return ((present.rank(method="average") - 1) / (len(present) - 1)).reindex(values.index)


def pays_twice(counties: pd.DataFrame, grid_value: pd.DataFrame, years: tuple[int, int] = GRID_YEARS) -> pd.DataFrame:
    """counties: county_fips, county, load_zone, utility_id, long_outages_per_year, homes."""
    window = grid_value.loc[grid_value["year"].between(*years)]
    by_zone = window.groupby("load_zone")["arbitrage_usd_upper_bound"].mean()
    out = counties.copy()
    out["household_long_outages"] = out["long_outages_per_year"] * out["homes"]
    out["grid_usd_per_core"] = out["load_zone"].map(by_zone)
    out["home_rank"] = ranks(out["household_long_outages"])
    out["grid_rank"] = ranks(out["grid_usd_per_core"])
    out["index"] = np.sqrt(out["home_rank"] * out["grid_rank"])
    out["base_offer"] = [base_offer(None if pd.isna(uid) else int(uid))["product"] for uid in out["utility_id"]]
    return out.sort_values("index", ascending=False, na_position="last").reset_index(drop=True)


def load_counties(con: duckdb.DuckDBPyConnection) -> pd.DataFrame:
    return con.execute("""
        select i.county_fips, i.county, i.load_zone, i.utility_id, i.utility_name,
               o.long_outages_per_year, l.homes
        from county_info i
        join outlook o using (county_fips)
        left join county_layers l using (county_fips)
    """).df()


def main() -> int:
    with duckdb.connect(str(settings.FEATURES_DUCKDB), read_only=True) as con:
        tables = {row[0] for row in con.execute("show tables").fetchall()}
        if "county_layers" not in tables:
            print("county_layers is missing; run python -m pipeline.map_layers first")
            return 1
        table = pays_twice(load_counties(con), con.execute("select * from grid_value").df())
    table.to_csv(settings.PAYS_TWICE_CSV, index=False, float_format="%.4f")
    with duckdb.connect(str(settings.FEATURES_DUCKDB)) as con:
        con.register("frame", table)
        con.execute("CREATE OR REPLACE TABLE pays_twice AS SELECT * FROM frame")
        con.unregister("frame")
    cols = ["county", "load_zone", "base_offer", "household_long_outages", "grid_usd_per_core", "index"]
    print("top counties overall")
    print(table.head(TOP_N)[cols].to_string(index=False, float_format=lambda v: f"{v:,.2f}"))
    print("\ntop counties where Base sells energy only or nothing today (expansion candidates)")
    expansion = table.loc[table["base_offer"].isin(["energy_only", "none"]) & table["index"].notna()]
    print(expansion.head(TOP_N)[cols].to_string(index=False, float_format=lambda v: f"{v:,.2f}"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
