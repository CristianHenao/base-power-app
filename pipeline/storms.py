"""Name the outage events that belong to a marquee storm (data/reference/storms.yaml).

Run: python -m pipeline.storms   (after pipeline.backtest and pipeline.sources.crosswalk)
Writes data/processed/event_storms.csv: county_fips, start (UTC), storm. Unnamed events are left out.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

import pandas as pd
import yaml

from pipeline import settings

STORMS_YAML = settings.REPO_ROOT / "data" / "reference" / "storms.yaml"
OUT_CSV = settings.REPO_ROOT / "data" / "processed" / "event_storms.csv"
LOCAL_TZ = "America/Chicago"
# A storm only names events it visibly caused: at least this share of the county out at peak.
MIN_PEAK_PCT = 1.0


@dataclass(frozen=True)
class Storm:
    name: str
    start: pd.Timestamp  # UTC, start of the first Central day
    end: pd.Timestamp  # UTC, end of the last Central day
    zones: frozenset[str] | None  # None means every zone


def load_storms(path: Path = STORMS_YAML) -> list[Storm]:
    storms = []
    for row in yaml.safe_load(path.read_text())["storms"]:
        start = pd.Timestamp(str(row["start"])).tz_localize(LOCAL_TZ).tz_convert("UTC")
        end = (pd.Timestamp(str(row["end"])) + pd.Timedelta(days=1)).tz_localize(LOCAL_TZ).tz_convert("UTC")
        zones = None if row["zones"] == "all" else frozenset(row["zones"])
        storms.append(Storm(row["name"], start, end, zones))
    return storms


def label_events(
    events: pd.DataFrame,
    zones: pd.Series,
    storms: list[Storm],
    min_peak_pct: float = MIN_PEAK_PCT,
) -> pd.Series:
    """Storm name per event, or None. With two candidates, the larger overlap wins."""
    start = pd.to_datetime(events["start"], utc=True)
    end = pd.to_datetime(events["end"], utc=True)
    zone = events["county_fips"].map(zones)
    big_enough = events["peak_out_pct"] >= min_peak_pct
    best = pd.Series([None] * len(events), index=events.index, dtype=object)
    best_overlap = pd.Series(pd.Timedelta(0), index=events.index)
    for storm in storms:
        overlap = (end.clip(upper=storm.end) - start.clip(lower=storm.start)).clip(lower=pd.Timedelta(0))
        in_zone = zone.notna() if storm.zones is None else zone.isin(storm.zones)
        wins = in_zone & big_enough & (overlap > best_overlap)
        best[wins] = storm.name
        best_overlap[wins] = overlap[wins]
    return best


def main() -> int:
    events = pd.read_parquet(settings.TEXAS_EVENTS_PARQUET)
    zones = pd.read_csv(settings.COUNTY_WEATHER_ZONE_CSV, dtype={"county_fips": str}).set_index("county_fips")[
        "weather_zone"
    ]
    events["storm"] = label_events(events, zones, load_storms())
    named = events.dropna(subset=["storm"])[["county_fips", "start", "storm"]]
    named = named.assign(start=pd.to_datetime(named["start"], utc=True).dt.strftime("%Y-%m-%dT%H:%M:%SZ"))
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    named.sort_values(["county_fips", "start"]).to_csv(OUT_CSV, index=False)
    print(named["storm"].value_counts().to_string())
    print(f"wrote {len(named)} named events to {OUT_CSV}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
