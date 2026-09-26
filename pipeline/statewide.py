"""Storm replays and a Core recommendation for every Texas county and both heat types.

Run: python -m pipeline.statewide   (after pipeline.features; stop `make api` first, it holds a read lock)

The demo homes already get this in pipeline.features. Here the same replay runs for each
county's long outages (share of homes out 12 h+ above zero) and its largest events, on
the ERCOT profile for its weather zone and each heat type. Writes the tables
event_replays_texas and sizing_texas to data/features.duckdb.
"""
from __future__ import annotations

import sys
import time

import duckdb
import pandas as pd

from pipeline import settings
from pipeline.features import ORDERS, CORES, replay_events, sizing_table
from pipeline.simulate import ProfileYears
from pipeline.sources.eaglei import columns_from_settings, concat_yearly, county_series, keep_from, keep_texas, list_yearly_csvs

REPLAY_COLUMNS = [f"backup_h_{n}" for n in CORES] + [
    f"covered_{order}_{n}_{what}" for order in ORDERS for n in CORES for what in ("homes", "hours")
]


def events_to_replay(events: pd.DataFrame, top_n: int = settings.REPORT_EVENTS,
                     order: str = settings.LONG_OUTAGE_ORDER) -> pd.DataFrame:
    """Every long outage plus each county's largest events (the ones a report shows)."""
    long = events[f"share_12h_{order}"] > 0
    largest = events.groupby("county_fips")["customer_hours"].rank(method="first", ascending=False) <= top_n
    return events.loc[long | largest]


def texas_series(fips: list[str]) -> dict[str, pd.Series]:
    columns = columns_from_settings()
    if columns is None:
        raise RuntimeError("EAGLE-I column map in pipeline/settings.py is unset")
    start = pd.Timestamp(settings.RATES_START, tz="UTC")
    frame = keep_from(keep_texas(concat_yearly(list_yearly_csvs(settings.RAW_EAGLEI_DIR), columns)), start)
    return {code: county_series(frame, code) for code in fips}


def main() -> int:
    started = time.perf_counter()
    with duckdb.connect(str(settings.FEATURES_DUCKDB), read_only=True) as con:
        events = con.execute("select * from events_texas").df()
        info = con.execute("select county_fips, county, weather_zone from county_info").df()
    names = dict(zip(info["county_fips"], info["county"], strict=True))
    zones = dict(zip(info["county_fips"], info["weather_zone"], strict=True))
    selected = events_to_replay(events)
    series = texas_series(sorted(selected["county_fips"].unique()))
    print(f"{len(selected):,} events in {selected['county_fips'].nunique()} counties; "
          f"series loaded in {time.perf_counter() - started:.0f} s", flush=True)

    replays, sizings = [], []
    for profile_type in settings.PROFILE_TYPES:
        shared = {zone: ProfileYears(profile_type, zone) for zone in set(zones.values())}
        profiles = {fips: shared[zones[fips]] for fips in selected["county_fips"].unique()}
        replayed, long_parts = replay_events(selected, series, profiles)
        table = selected[["id", "county_fips"]].join(replayed.reindex(columns=REPLAY_COLUMNS))
        table.insert(1, "profile_type", profile_type)
        replays.append(table)
        sizing = sizing_table(long_parts, counties={fips: names[fips] for fips in names})
        sizing.insert(1, "profile_type", profile_type)
        sizings.append(sizing)
        print(f"{profile_type}: replayed in {time.perf_counter() - started:.0f} s", flush=True)

    replay_table, sizing_table_all = pd.concat(replays, ignore_index=True), pd.concat(sizings, ignore_index=True)
    with duckdb.connect(str(settings.FEATURES_DUCKDB)) as con:
        for name, frame in (("event_replays_texas", replay_table), ("sizing_texas", sizing_table_all)):
            con.register("frame", frame)
            con.execute(f"CREATE OR REPLACE TABLE {name} AS SELECT * FROM frame")
            con.unregister("frame")
    counts = sizing_table_all.groupby(["profile_type", "cores"]).size().unstack(fill_value=0)
    print(f"wrote event_replays_texas ({len(replay_table):,}) and sizing_texas ({len(sizing_table_all)})")
    print("recommended Cores by heat type:\n" + counts.to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main())
