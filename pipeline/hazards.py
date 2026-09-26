"""What caused each outage: tropical, winter, wind, flood, or other.

Alejandro's hand-checked marquee storms (data/reference/storms.yaml) come first; they
carry most outage hours, and NOAA's zone-based entries miss some of them (Harris has
no Storm Events rows for Beryl). Other outages take the most severe NOAA Storm Events
hazard reported in the same county from 12 hours before to 6 hours after the outage
starts. Heat is left out: multi-day heat advisories would label unrelated outages.
"""
from __future__ import annotations

import re

import pandas as pd

HAZARDS = ("tropical", "winter", "wind", "flood", "other")
NOAA_GROUPS: dict[str, frozenset[str]] = {
    "tropical": frozenset({"Hurricane (Typhoon)", "Tropical Storm", "Tropical Depression", "Storm Surge/Tide"}),
    "winter": frozenset({"Winter Storm", "Ice Storm", "Winter Weather", "Heavy Snow", "Blizzard", "Sleet",
                         "Cold/Wind Chill", "Extreme Cold/Wind Chill", "Frost/Freeze", "Freezing Fog"}),
    "wind": frozenset({"Thunderstorm Wind", "High Wind", "Strong Wind", "Tornado", "Hail", "Lightning",
                       "Funnel Cloud", "Dust Storm"}),
    "flood": frozenset({"Flash Flood", "Flood", "Heavy Rain", "Coastal Flood"}),
}
BEFORE = pd.Timedelta(hours=12)
AFTER = pd.Timedelta(hours=6)
_NAMED = (
    (re.compile(r"hurricane|tropical|nicholas|beryl|harvey|hanna|imelda|francine", re.I), "tropical"),
    (re.compile(r"winter|\buri\b|ice|mara|freeze|snow|cold", re.I), "winter"),
)


def named_storm_hazard(name: object) -> str | None:
    """Hazard for a marquee storm name; any other named storm (derechos, squall lines) is wind."""
    if not isinstance(name, str) or not name:
        return None
    for pattern, hazard in _NAMED:
        if pattern.search(name):
            return hazard
    return "wind"


def label_hazards(events: pd.DataFrame, storm_events: pd.DataFrame) -> pd.Series:
    """events: county_fips, start (UTC), storm (name or null). storm_events: county_fips, begin_utc, end_utc, event_type."""
    labels = events["storm"].map(named_storm_hazard) if "storm" in events else pd.Series(None, index=events.index)
    group_of = {t: g for g, types in NOAA_GROUPS.items() for t in types}
    noaa = storm_events.loc[storm_events["event_type"].isin(group_of),
                            ["county_fips", "begin_utc", "end_utc", "event_type"]]
    noaa = noaa.assign(hazard=noaa["event_type"].map(group_of),
                       rank=noaa["event_type"].map(group_of).map({h: i for i, h in enumerate(HAZARDS)}))
    unnamed = events.loc[labels.isna(), ["county_fips", "start"]].reset_index(names="_row")
    if not unnamed.empty and not noaa.empty:
        joined = unnamed.merge(noaa, on="county_fips")
        start = pd.to_datetime(joined["start"], utc=True)
        near = (joined["begin_utc"] <= start + AFTER) & (joined["end_utc"] >= start - BEFORE)
        best = joined.loc[near].sort_values("rank").drop_duplicates("_row").set_index("_row")["hazard"]
        labels = labels.fillna(best.reindex(labels.index))
    return labels.fillna("other").rename("hazard")
