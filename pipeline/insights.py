"""Two Track 1 insights: the tail is the product, and same Core, different month.

Run: python -m pipeline.insights   (after pipeline.backtest; uses the ERCOT profile cache)

Writes data/processed/tail_share.parquet and data/processed/insights.json for charts.
Tail share counts only customer-hours inside detected events, so outage hours below
the event threshold are not in the denominator.
"""
from __future__ import annotations

import json
import math
import sys
from datetime import date, timedelta

import numpy as np
import pandas as pd

from api.app.sim.backup import STORM_LOAD_FACTOR, backup_hours, hours_by_month
from pipeline import settings
from pipeline.sources.ercot_profiles import annual_kwh, cached_days_by_month, profile_code, typical_day

DaysByMonth = dict[int, list[tuple[date, np.ndarray]]]

MONTH_YEAR = 2024
STORM_DAYS = 7
CORES = (1, 2)


def tail_share(events: pd.DataFrame, n: int = settings.TAIL_EVENTS) -> pd.DataFrame:
    """Share of each county's event customer-hours that came from its `n` largest events."""
    if n < 1:
        raise ValueError("n must be at least 1")
    ranked = events.sort_values("customer_hours", ascending=False)
    grouped = ranked.groupby("county_fips")["customer_hours"]
    table = pd.DataFrame({
        "events": grouped.size(),
        "customer_hours": grouped.sum(),
        "top_customer_hours": ranked.groupby("county_fips").head(n).groupby("county_fips")["customer_hours"].sum(),
    })
    table["top_share"] = np.where(
        table["customer_hours"] > 0, table["top_customer_hours"] / table["customer_hours"], np.nan,
    )
    return table.sort_index()


def tail_summary(table: pd.DataFrame, names: pd.Series, demo: tuple[str, ...]) -> dict:
    """Statewide spread of the top-event share plus the demo counties, rounded for charts."""
    share = table["top_share"].dropna()
    return {
        "top_events": settings.TAIL_EVENTS,
        "since": settings.RATES_START[:4],
        "counties": int(share.size),
        "median_share": round(float(share.median()), 3),
        "quartiles": [round(float(q), 3) for q in share.quantile([0.25, 0.75])],
        "counties_over_half": int((share > 0.5).sum()),
        "demo": [
            {
                "county_fips": fips,
                "county": str(names.get(fips, fips)),
                "events": int(table.at[fips, "events"]),
                "top_share": round(float(table.at[fips, "top_share"]), 3),
            }
            for fips in demo if fips in table.index
        ],
    }


def month_hours(days: DaysByMonth, storm_factor: float = 1.0) -> dict[str, list[float]]:
    """Backup hours by month for the profile's typical customer, one and two Cores."""
    typical = [typical_day([trace for _, trace in days[month]]) for month in range(1, 13)]
    total = annual_kwh(days)
    return hours_by_month(typical, profile_annual_kwh=total, home_annual_kwh=total, storm_factor=storm_factor)


def storm_week_hours(days: DaysByMonth, start: date, n_days: int = STORM_DAYS) -> dict[int, float]:
    """Hours until empty on the real profile days from `start`. inf means it outlasted the week."""
    lookup = {day: trace for month in days.values() for day, trace in month}
    needed = [start + timedelta(days=offset) for offset in range(n_days)]
    missing = [day.isoformat() for day in needed if day not in lookup]
    if missing:
        raise ValueError(f"missing profile days: {', '.join(missing)}")
    trace = np.concatenate([lookup[day] for day in needed])
    total = annual_kwh(days)
    return {cores: backup_hours(trace, cores, profile_annual_kwh=total, home_annual_kwh=total) for cores in CORES}


def month_gap(hours: list[float]) -> dict[str, float | int]:
    """Shortest and longest month, 1-based, and their ratio."""
    low, high = int(np.argmin(hours)), int(np.argmax(hours))
    return {
        "short_month": low + 1, "short_hours": round(hours[low], 1),
        "long_month": high + 1, "long_hours": round(hours[high], 1),
        "ratio": round(hours[high] / hours[low], 2),
    }


def _json_hours(value: float) -> float | None:
    return None if math.isinf(value) else round(value, 1)


def _profile_year(year: int, profile_type: str, zone: str) -> DaysByMonth:
    every = tuple(profile_code(p, z) for p in settings.PROFILE_TYPES for z in settings.WEATHER_ZONES)
    return cached_days_by_month(year, profile_type, zone, also=every)


def zone_rows() -> tuple[list[dict], list[dict]]:
    """Monthly rows and storm-week rows for every weather zone and profile type."""
    months: list[dict] = []
    storms: list[dict] = []
    for profile_type in settings.PROFILE_TYPES:
        for zone in settings.WEATHER_ZONES:
            days = _profile_year(MONTH_YEAR, profile_type, zone)
            for mode, factor in (("normal", 1.0), ("storm", STORM_LOAD_FACTOR)):
                table = month_hours(days, storm_factor=factor)
                for cores in CORES:
                    hours = table[f"cores_{cores}"]
                    months.append({
                        "weather_zone": zone, "profile_type": profile_type, "mode": mode, "cores": cores,
                        "hours": [round(value, 1) for value in hours], **month_gap(hours),
                    })
            for name, start in settings.STORM_WEEKS.items():
                day = date.fromisoformat(start)
                hours = storm_week_hours(_profile_year(day.year, profile_type, zone), day)
                storms.append({
                    "storm": name, "start": start, "weather_zone": zone, "profile_type": profile_type,
                    **{f"cores_{cores}": _json_hours(hours[cores]) for cores in CORES},
                })
    return months, storms


def main() -> int:
    if not settings.TEXAS_EVENTS_PARQUET.exists():
        print(f"missing {settings.TEXAS_EVENTS_PARQUET}; run python -m pipeline.backtest first")
        return 1
    events = pd.read_parquet(settings.TEXAS_EVENTS_PARQUET)
    tails = tail_share(events)
    tails.to_parquet(settings.TAIL_SHARE_PARQUET)
    crosswalk = pd.read_csv(settings.COUNTY_WEATHER_ZONE_CSV, dtype={"county_fips": "string"})
    names = crosswalk.set_index(crosswalk["county_fips"].str.zfill(5))["county"]
    summary = tail_summary(tails, names, settings.DEMO_FIPS)

    months, storms = zone_rows()
    record = {
        "tail_share": summary,
        "month_by_zone": {"profile_year": MONTH_YEAR, "storm_load_factor": STORM_LOAD_FACTOR, "rows": months},
        "storm_weeks": {"days": STORM_DAYS, "note": "null means the Cores outlasted the week", "rows": storms},
    }
    settings.INSIGHTS_JSON.write_text(json.dumps(record, indent=2) + "\n")

    print(f"tail share: top {summary['top_events']} events, median {summary['median_share']:.0%} "
          f"across {summary['counties']} counties, {summary['counties_over_half']} over half")
    for row in summary["demo"]:
        print(f"  {row['county']:<8} {row['top_share']:.0%} of {row['events']} events")
    print("one Core, normal load, 2024: shortest and longest month")
    for row in months:
        if row["mode"] == "normal" and row["cores"] == 1:
            print(f"  {row['profile_type']} {row['weather_zone']:<5} {row['short_hours']:>5}h (m{row['short_month']:>2})"
                  f"  {row['long_hours']:>5}h (m{row['long_month']:>2})  x{row['ratio']}")
    print("storm weeks, one and two Cores")
    for row in storms:
        print(f"  {row['storm']:<17} {row['profile_type']} {row['weather_zone']:<5} {row['cores_1']}h {row['cores_2']}h")
    return 0


if __name__ == "__main__":
    sys.exit(main())
