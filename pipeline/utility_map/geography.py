"""County land area from the Census Gazetteer, for per-area hazard rates.

Source: https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_counties_national.zip
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from pipeline import settings

GAZETTEER_URL = (
    "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_counties_national.zip"
)
GAZETTEER = settings.RAW_DIR / "census" / "2024_Gaz_counties_national.txt"


def county_land_km2(path: Path = GAZETTEER, state_fips: str = "48") -> pd.Series:
    frame = pd.read_csv(path, sep="\t", dtype={"GEOID": str})
    frame.columns = [column.strip() for column in frame.columns]
    texas = frame.loc[frame["GEOID"].str.startswith(state_fips)]
    return pd.Series(texas["ALAND"].to_numpy() / 1e6, index=texas["GEOID"].to_numpy(), name="land_km2")
