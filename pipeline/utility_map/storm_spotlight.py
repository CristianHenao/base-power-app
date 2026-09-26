"""Storm spotlight: the labeled marquee storms and the counties they darkened (UM-D9).

Storms and windows come from data/reference/storms.yaml; outage events labeled with a
storm by pipeline.storms (data/processed/event_storms.csv) are joined to their EAGLE-I
event rows (events_texas.parquet). Per county: worst peak customers out (and share of
customers) and total customer-hours across the storm's events. EAGLE-I starts in 2018,
so storms before then (Harvey, Ike) have no outage footprint here.

Where a county's modeled customer count was below its peak outage, the pipeline raises the
count to that peak (outlook.customers_floored). The share out then reads 100% by construction,
so it is left out (null) and flagged, as the address reports do (pipeline.reports.event_record).

Run: python -m pipeline.utility_map.storm_spotlight
"""
from __future__ import annotations

import json
import sys

import pandas as pd
import yaml

from pipeline import settings

STORMS_YAML = settings.REPO_ROOT / "data" / "reference" / "storms.yaml"
LABELS = settings.REPO_ROOT / "data" / "processed" / "event_storms.csv"
# NHC ids for storms that have a HURDAT2 track.
TRACKS = {"Hurricane Beryl": "AL022024", "Hurricane Nicholas": "AL142021"}
OUT = settings.UTILITY_MAP_DIR / "hazards" / "storms.json"


def storm_counties(
    events: pd.DataFrame, labels: pd.DataFrame, storm: str, floored: set[str] | frozenset[str] = frozenset(),
) -> list[dict]:
    mine = labels.loc[labels["storm"] == storm, ["county_fips", "start"]]
    joined = events.merge(mine, on=["county_fips", "start"], how="inner")
    per_county = joined.groupby("county_fips").agg(
        peak_out=("peak_out", "max"), peak_out_pct=("peak_out_pct", "max"), customer_hours=("customer_hours", "sum"),
    ).sort_values("customer_hours", ascending=False)
    return [
        {"fips": fips, "peak_out": int(round(r.peak_out)),
         "peak_out_pct": None if fips in floored else round(float(r.peak_out_pct), 1),
         "customers_floored": fips in floored,
         "customer_hours": float(round(r.customer_hours))}
        for fips, r in per_county.iterrows()
    ]


def main() -> int:
    events = pd.read_parquet(settings.TEXAS_EVENTS_PARQUET)
    events["start"] = pd.to_datetime(events["start"], utc=True)
    labels = pd.read_csv(LABELS, dtype={"county_fips": str})
    labels["start"] = pd.to_datetime(labels["start"], utc=True)
    outlook = pd.read_parquet(settings.OUTLOOK_PARQUET)
    floored = set(outlook.index[outlook["customers_floored"].astype(bool)].astype(str))
    storms = []
    for storm in yaml.safe_load(STORMS_YAML.read_text())["storms"]:
        counties = storm_counties(events, labels, storm["name"], floored)
        if not counties:
            continue
        storms.append({
            "name": storm["name"], "start": str(storm["start"]), "end": str(storm["end"]),
            "source": storm.get("source"), "note": storm.get("note"),
            "track_storm_id": TRACKS.get(storm["name"]), "counties": counties,
        })
        print(f"{storm['name']:<40} {len(counties):>3} counties, "
              f"{sum(c['customer_hours'] for c in counties) / 1e6:,.1f}M customer-hours")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"storms": storms}, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
