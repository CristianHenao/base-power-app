"""County hazard layers built from NOAA Storm Events and FEMA NRI (UM-3.2, UM-5.1).

flood  value: flood, flash-flood and coastal-flood event-days per year (2000-2025);
       rank:  mean of the Texas ranks of that value and FEMA NRI's flood score.
winter value: winter storm, ice, snow, cold and freeze event-days per year (2000-2025).
heat   value: heat and excessive-heat event-days per year (2000-2025).
Event-days count each county and local date once, so one storm filed as several
reports is one day. Counties with no events get 0 (a measured zero), not missing.

Run: python -m pipeline.utility_map.hazard_layers  (after storm_events)
"""
from __future__ import annotations

import sys

import pandas as pd

from pipeline import settings
from pipeline.map_layers import nri_layers, percentile_ranks
from pipeline.utility_map.storm_events import YEARS

FLOOD_TYPES = {"Flood", "Flash Flood", "Coastal Flood"}
WINTER_TYPES = {"Winter Storm", "Ice Storm", "Extreme Cold/Wind Chill", "Cold/Wind Chill",
                "Frost/Freeze", "Heavy Snow", "Blizzard", "Winter Weather"}
HEAT_TYPES = {"Heat", "Excessive Heat"}
EVENTS = settings.UTILITY_MAP_DIR / "storm_events.parquet"


def event_days_per_year(events: pd.DataFrame, types: set[str], years: int, counties: list[str]) -> pd.Series:
    hits = events.loc[events["event_type"].isin(types), ["county_fips", "begin_local_date"]].drop_duplicates()
    days = hits.groupby("county_fips").size() / years
    return days.reindex(counties, fill_value=0.0).astype(float)


def combined_rank(components: list[pd.Series]) -> pd.Series:
    ranks = pd.concat([percentile_ranks(c.astype(float)) for c in components], axis=1)
    return ranks.mean(axis=1, skipna=True)


def _counties() -> list[str]:
    return sorted(pd.read_csv(settings.COUNTY_WEATHER_ZONE_CSV, dtype={"county_fips": str})["county_fips"])


def main() -> int:
    events = pd.read_parquet(EVENTS)
    counties = _counties()
    years = len(YEARS)
    flood_days = event_days_per_year(events, FLOOD_TYPES, years, counties)
    nri_flood = nri_layers(settings.RAW_DIR / "fema" / "nri_counties_tx.csv")["flood"].reindex(counties)
    flood = pd.DataFrame({
        "county_fips": counties,
        "value": flood_days.round(3).to_numpy(),
        "rank": combined_rank([flood_days, nri_flood]).round(3).to_numpy(),
        "event_days_per_year": flood_days.to_numpy(),
        "nri_flood": nri_flood.to_numpy(),
    })
    flood.to_parquet(settings.UTILITY_MAP_DIR / "county_flood.parquet", index=False)
    for name, types in (("winter", WINTER_TYPES), ("heat", HEAT_TYPES)):
        days = event_days_per_year(events, types, years, counties).round(3)
        days.rename(name).rename_axis("county_fips").reset_index().to_parquet(
            settings.UTILITY_MAP_DIR / f"county_{name}.parquet", index=False)
        print(f"{name}: {(days > 0).sum()} counties with events; top {days.idxmax()} {days.max():.2f} days/yr")
    print(flood.sort_values("rank", ascending=False).head(8).to_string(index=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
