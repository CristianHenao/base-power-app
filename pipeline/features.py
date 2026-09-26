"""Build data/features.duckdb, the read-only tables behind /v1/report.

Run: python -m pipeline.features   (after pipeline.sources.eaglei and pipeline.backtest)

Tables
  outlook              one row per Texas county
  events               demo-county events with replayed backup hours and coverage
  events_texas         every county's events with ids and marquee storm names (no replay)
  backup_monthly       demo-county hours by month for 1 and 2 Cores, normal, storm and surprise mode
  backup_zone_monthly  the same by weather zone and profile type, for any county
  county_info          county name, weather zone, primary utility, grid and load zone
  sizing          recommended Core count and its sentence
  assumptions     battery and simulator constants the numbers depend on
  grid_value      per load zone and year, when pipeline.grid_value has run
"""
from __future__ import annotations

import sys

import duckdb
import pandas as pd

from api.app.sim.backup import KW_PER_CORE, KWH_PER_CORE, RESERVE_SOC, STORM_LOAD_FACTOR, hours_by_month
from pipeline import settings
from pipeline.events import customer_durations, event_curve
from pipeline.simulate import ProfileYears, event_local_date, replay_coverage
from pipeline.sizing import (
    LONG_OUTAGE_H,
    SIZING_TARGET,
    covered_share,
    long_hours,
    size_cores,
    sizing_reason,
)
from pipeline.sources.eaglei import demo_series
from pipeline.insights import month_hours
from pipeline.sources.eia861 import load_zone
from pipeline.sources.ercot_profiles import cached_days_by_month, profile_code, typical_day
from pipeline.storms import label_events, load_storms

BACKUP_YEAR = 2024
CORES = (1, 2)
ORDERS = ("rotate", "stay")


def event_ids(events: pd.DataFrame) -> pd.Series:
    """Report ids like 48085-2021-02-14, Central date, with -2, -3 only when a county has two events that day."""
    local = pd.to_datetime(events["start"], utc=True).dt.tz_convert("America/Chicago")
    base = events["county_fips"].astype(str) + "-" + local.dt.strftime("%Y-%m-%d")
    order = pd.DataFrame({"base": base, "start": events["start"]}).sort_values("start")
    rank = order.groupby("base").cumcount() + 1
    suffix = rank.map(lambda n: "" if n == 1 else f"-{n}")
    return (order["base"] + suffix).reindex(events.index)


def replay_events(events: pd.DataFrame, series: dict[str, pd.Series],
                  profiles: dict[str, ProfileYears]) -> tuple[pd.DataFrame, dict[str, dict]]:
    """Backup hours and coverage for every event, plus long-outage hour totals for sizing.

    Events whose profile week is not on disk (the last days of the newest year) get nulls.
    """
    rows = []
    long_parts: dict[str, dict[str, dict[int, list[tuple[float, float]]]]] = {}
    for idx, event in events.iterrows():
        fips = str(event["county_fips"])
        row: dict[str, object] = {"_idx": idx}
        day = event_local_date(event["start"])
        try:
            trace = profiles[fips].span(day, 7)
            annual = profiles[fips].annual_kwh(day.year)
        except (FileNotFoundError, ValueError):
            rows.append(row)
            continue
        curve = event_curve(series[fips], event["start"], event["end"])
        result = replay_coverage(curve, trace, profile_annual_kwh=annual, home_annual_kwh=annual)
        per_order = long_parts.setdefault(fips, {order: {n: [] for n in CORES} for order in ORDERS})
        for cores in CORES:
            row[f"backup_h_{cores}"] = result["hours"][cores]
        for order in ORDERS:
            durations, weights = customer_durations(curve, order=order)
            for cores in CORES:
                covered = result["covered"][order][cores]
                row[f"covered_{order}_{cores}_homes"] = covered["homes"]
                row[f"covered_{order}_{cores}_hours"] = covered["hours"]
                per_order[order][cores].append(long_hours(durations, weights, result["hours"][cores]))
        rows.append(row)
    table = pd.DataFrame(rows).set_index("_idx")
    table.index.name = None
    return table, long_parts


def backup_monthly(profiles: dict[str, ProfileYears], year: int = BACKUP_YEAR) -> pd.DataFrame:
    rows = []
    for fips, source in profiles.items():
        typical = [typical_day(source.month_traces(year, month)) for month in range(1, 13)]
        annual = source.annual_kwh(year)
        for mode, factor, soc in BACKUP_MODES:
            table = hours_by_month(typical, profile_annual_kwh=annual, home_annual_kwh=annual,
                                   storm_factor=factor, start_soc=soc)
            for cores in CORES:
                for month, hours in enumerate(table[f"cores_{cores}"], start=1):
                    rows.append({
                        "county_fips": fips, "profile_year": year, "month": month,
                        "cores": cores, "mode": mode, "hours": hours,
                        "profile_type": source.profile_type, "weather_zone": source.weather_zone,
                    })
    return pd.DataFrame(rows)


def sizing_table(long_parts: dict[str, dict], order: str = settings.LONG_OUTAGE_ORDER) -> pd.DataFrame:
    """Cores and reason use `order`. Both orderings' shares are kept as the band."""
    since = pd.Timestamp(settings.RATES_START).year
    empty = {name: {n: [] for n in CORES} for name in ORDERS}
    rows = []
    for fips, county in settings.DEMO_COUNTIES.items():
        parts = long_parts.get(fips, empty)
        shares = {name: {n: covered_share(parts[name][n]) for n in CORES} for name in ORDERS}
        cores = size_cores(shares[order])
        row = {
            "county_fips": fips, "cores": cores, "reason": sizing_reason(cores, shares[order], county, since),
            "order": order, "target": SIZING_TARGET,
            "events_used": sum(1 for _, total in parts[order][1] if total > 0),
        }
        for name in ORDERS:
            for n in CORES:
                row[f"{name}_share_{n}"] = shares[name][n]
        rows.append(row)
    return pd.DataFrame(rows)


def assumptions_table() -> pd.DataFrame:
    return pd.DataFrame([
        {"name": "kwh_per_core", "value": KWH_PER_CORE, "note": "Base public spec"},
        {"name": "kw_per_core", "value": KW_PER_CORE, "note": "Base public spec; help center lists 11 kW for backup"},
        {"name": "start_soc", "value": 1.0, "note": "battery starts full; storms are forecast"},
        {"name": "reserve_soc", "value": RESERVE_SOC, "note": "Base's backup reserve; start of the surprise mode"},
        {"name": "storm_load_factor", "value": STORM_LOAD_FACTOR, "note": "labeled 30% load reduction"},
        {"name": "long_outage_hours", "value": LONG_OUTAGE_H, "note": "12-hour-plus threshold"},
        {"name": "sizing_target", "value": SIZING_TARGET, "note": "share of long outage hours covered"},
        {"name": "backup_profile_year", "value": float(BACKUP_YEAR), "note": "ERCOT backcasted profile year for monthly hours"},
    ])


# (mode, load factor, starting charge). "surprise" is an outage nobody forecast: normal use from Base's 20% reserve.
BACKUP_MODES = (("normal", 1.0, 1.0), ("storm", STORM_LOAD_FACTOR, 1.0), ("surprise", 1.0, RESERVE_SOC))


def statewide_events(texas: pd.DataFrame, zones: pd.Series) -> pd.DataFrame:
    """Every county's events with report ids and Alejandro's marquee storm names."""
    events = texas.reset_index(drop=True).copy()
    events.insert(0, "id", event_ids(events))
    events["storm"] = label_events(events, zones, load_storms())
    return events


def backup_zone_monthly(year: int = BACKUP_YEAR) -> pd.DataFrame:
    """Hours by month for every weather zone and profile type, from the profile cache."""
    rows = []
    every = tuple(profile_code(p, z) for p in settings.PROFILE_TYPES for z in settings.WEATHER_ZONES)
    for profile_type in settings.PROFILE_TYPES:
        for zone in settings.WEATHER_ZONES:
            days = cached_days_by_month(year, profile_type, zone, also=every)
            for mode, factor, soc in BACKUP_MODES:
                table = month_hours(days, storm_factor=factor, start_soc=soc)
                for cores in CORES:
                    for month, hours in enumerate(table[f"cores_{cores}"], start=1):
                        rows.append({"weather_zone": zone, "profile_type": profile_type, "profile_year": year,
                                     "mode": mode, "cores": cores, "month": month, "hours": hours})
    return pd.DataFrame(rows)


def county_info(crosswalk: pd.DataFrame, county_utility: pd.DataFrame) -> pd.DataFrame:
    """One row per county: name, weather zone, primary wires utility, grid and load zone."""
    primary = county_utility.loc[county_utility["primary"].astype(str) == "True",
                                 ["county_fips", "utility_id", "utility_name", "grid"]]
    info = crosswalk[["county_fips", "county", "weather_zone"]].merge(primary, on="county_fips", how="left")
    info["load_zone"] = [
        None if pd.isna(uid) else load_zone(int(uid), grid, zone)
        for uid, grid, zone in zip(info["utility_id"], info["grid"], info["weather_zone"], strict=True)
    ]
    return info


def write_features(tables: dict[str, pd.DataFrame], path=settings.FEATURES_DUCKDB) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with duckdb.connect(str(path)) as con:
        for name, frame in tables.items():
            con.register("frame", frame)
            con.execute(f"CREATE OR REPLACE TABLE {name} AS SELECT * FROM frame")
            con.unregister("frame")


def main() -> int:
    events = pd.read_parquet(settings.EVENTS_PARQUET)
    outlook = pd.read_parquet(settings.OUTLOOK_PARQUET).reset_index()
    series = demo_series()
    profiles = {
        fips: ProfileYears(settings.DEMO_PROFILE[fips], settings.DEMO_WEATHER_ZONE[fips])
        for fips in settings.DEMO_FIPS
    }
    replayed, long_parts = replay_events(events, series, profiles)
    events = events.join(replayed)
    events.insert(0, "id", event_ids(events))
    crosswalk = pd.read_csv(settings.COUNTY_WEATHER_ZONE_CSV, dtype={"county_fips": "string"})
    crosswalk["county_fips"] = crosswalk["county_fips"].str.zfill(5)
    zones = crosswalk.set_index("county_fips")["weather_zone"]
    events["storm"] = label_events(events, zones, load_storms())
    monthly = backup_monthly(profiles)
    sizing = sizing_table(long_parts)
    county_utility = pd.read_csv(settings.COUNTY_UTILITY_CSV, dtype={"county_fips": "string"})
    tables = {
        "outlook": outlook,
        "events": events,
        "events_texas": statewide_events(pd.read_parquet(settings.TEXAS_EVENTS_PARQUET), zones),
        "backup_monthly": monthly,
        "backup_zone_monthly": backup_zone_monthly(),
        "county_info": county_info(crosswalk, county_utility),
        "sizing": sizing,
        "assumptions": assumptions_table(),
    }
    if settings.GRID_VALUE_PARQUET.exists():
        tables["grid_value"] = pd.read_parquet(settings.GRID_VALUE_PARQUET)
    write_features(tables)
    skipped = int(events["backup_h_1"].isna().sum())
    print(f"wrote {settings.FEATURES_DUCKDB}")
    print(f"{len(events):,} events, {skipped} without a profile week on disk")
    print(sizing[["county_fips", "cores", "stay_share_1", "stay_share_2", "rotate_share_1", "rotate_share_2", "events_used"]]
          .to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    for reason in sizing["reason"]:
        print(f"  {reason}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
