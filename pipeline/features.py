"""Build data/features.duckdb, the read-only tables behind /v1/report.

Run: python -m pipeline.features   (after pipeline.sources.eaglei and pipeline.backtest)

Tables
  outlook         one row per Texas county
  events          demo-county events with replayed backup hours and coverage
  backup_monthly  hours by month for 1 and 2 Cores, normal and storm mode
  sizing          recommended Core count and its sentence
  assumptions     battery and simulator constants the numbers depend on
  grid_value      per load zone and year, when pipeline.grid_value has run
"""
from __future__ import annotations

import sys

import duckdb
import pandas as pd

from api.app.sim.backup import KW_PER_CORE, KWH_PER_CORE, STORM_LOAD_FACTOR, hours_by_month
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
from pipeline.sources.ercot_profiles import typical_day

BACKUP_YEAR = 2024
CORES = (1, 2)
ORDERS = ("fifo", "lifo")


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
        for mode, factor in (("normal", 1.0), ("storm", STORM_LOAD_FACTOR)):
            table = hours_by_month(typical, profile_annual_kwh=annual, home_annual_kwh=annual, storm_factor=factor)
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
        {"name": "storm_load_factor", "value": STORM_LOAD_FACTOR, "note": "labeled 30% load reduction"},
        {"name": "long_outage_hours", "value": LONG_OUTAGE_H, "note": "12-hour-plus threshold"},
        {"name": "sizing_target", "value": SIZING_TARGET, "note": "share of long outage hours covered"},
        {"name": "backup_profile_year", "value": float(BACKUP_YEAR), "note": "ERCOT backcasted profile year for monthly hours"},
    ])


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
    monthly = backup_monthly(profiles)
    sizing = sizing_table(long_parts)
    tables = {
        "outlook": outlook,
        "events": events,
        "backup_monthly": monthly,
        "sizing": sizing,
        "assumptions": assumptions_table(),
    }
    if settings.GRID_VALUE_PARQUET.exists():
        tables["grid_value"] = pd.read_parquet(settings.GRID_VALUE_PARQUET)
    write_features(tables)
    skipped = int(events["backup_h_1"].isna().sum())
    print(f"wrote {settings.FEATURES_DUCKDB}")
    print(f"{len(events):,} events, {skipped} without a profile week on disk")
    print(sizing[["county_fips", "cores", "lifo_share_1", "lifo_share_2", "fifo_share_1", "fifo_share_2", "events_used"]]
          .to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    for reason in sizing["reason"]:
        print(f"  {reason}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
