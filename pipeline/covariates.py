"""County covariates for the outage frequency model.

FEMA NRI weather and flood scores (Alejandro's county_layers), log customers, the share of
customers served by electric co-ops (rural lines, longer restorations), and the ERCOT
weather zone. NRI is a 2025 snapshot, so a backtest that uses it sees slightly later
information than the training years; the model card says so.
"""
from __future__ import annotations

from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

NUMERIC = ("weather", "flood", "log_customers", "coop_share")
COOP = r"coop|co-op|cooperative"


def coop_share(county_utility: pd.DataFrame) -> pd.Series:
    """Customer-weighted share of each county served by utilities whose name says co-op."""
    is_coop = county_utility["utility_name"].str.contains(COOP, case=False, regex=True)
    frame = county_utility.assign(coop=is_coop.astype(float) * county_utility["share"])
    return frame.groupby("county_fips")["coop"].sum().clip(0.0, 1.0)


def county_covariates(features: Path, county_utility_csv: Path, customers: dict[str, float]) -> pd.DataFrame:
    with duckdb.connect(str(features), read_only=True) as con:
        layers = con.execute("select county_fips, weather, flood from county_layers").df().set_index("county_fips")
        zones = con.execute("select county_fips, weather_zone from county_info").df().set_index("county_fips")
    utilities = pd.read_csv(county_utility_csv, dtype={"county_fips": "string"})
    out = layers.join(zones, how="inner")
    out["log_customers"] = np.log(pd.Series(customers).reindex(out.index).fillna(1.0).clip(lower=1.0))
    out["coop_share"] = coop_share(utilities).reindex(out.index).fillna(0.0)
    out[["weather", "flood"]] = out[["weather", "flood"]].fillna(out[["weather", "flood"]].median())
    return out


def design(covariates: pd.DataFrame, zones: tuple[str, ...]) -> np.ndarray:
    """Intercept, standardized numeric covariates, and weather-zone dummies (first zone is the base)."""
    numeric = covariates[list(NUMERIC)].astype(float)
    scaled = (numeric - numeric.mean()) / numeric.std(ddof=0).replace(0.0, 1.0)
    dummies = [(covariates["weather_zone"].to_numpy() == z).astype(float) for z in zones[1:]]
    return np.column_stack([np.ones(len(covariates)), scaled.to_numpy(), *dummies])
