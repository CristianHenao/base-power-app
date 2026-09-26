"""Backup hours from ERCOT profile workbooks.

When no home annual kWh is passed, the profile's own year is the home. That is
the typical customer of that profile, and it is still an estimate.
"""
from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

from api.app.sim.backup import STORM_LOAD_FACTOR, backup_hours, hours_by_month
from pipeline import settings
from pipeline.events import coverage, customer_durations, event_curve
from pipeline.sources.eaglei import demo_series
from pipeline.sources.ercot_profiles import (
    annual_kwh,
    cached_days_by_month,
    profile_code,
    profile_days_by_month,
    span_kwh,
    typical_day,
    yearly_zip,
)


def monthly_backup(
    source: Path,
    profile_type: str,
    weather_zone: str,
    home_annual_kwh: float | None = None,
    storm_factor: float = 1.0,
) -> dict:
    """Twelve backup-hour pairs for one profile year."""
    days = profile_days_by_month(source, profile_type, weather_zone)
    profile_total = annual_kwh(days)
    home_total = profile_total if home_annual_kwh is None else home_annual_kwh
    typical = [typical_day([trace for _, trace in days[month]]) for month in range(1, 13)]
    table = hours_by_month(
        typical,
        profile_annual_kwh=profile_total,
        home_annual_kwh=home_total,
        storm_factor=storm_factor,
    )
    table["profile_annual_kwh"] = profile_total
    table["home_annual_kwh"] = home_total
    table["storm_factor"] = storm_factor
    return table


def replay_coverage(
    curve,
    week_kwh_15,
    *,
    profile_annual_kwh: float,
    home_annual_kwh: float,
    storm_factor: float = 1.0,
) -> dict[str, dict]:
    """Hours until empty, and coverage of the rotate and stay duration distributions.

    The trace is the ERCOT profile for the seven days at the event, scaled to the
    home. Coverage is the share of affected homes fully covered and the share of
    their dark hours covered.
    """
    hours: dict[int, float] = {}
    covered: dict[str, dict[int, dict[str, float]]] = {"rotate": {}, "stay": {}}
    durations = {
        order: customer_durations(curve, order=order) for order in ("rotate", "stay")
    }
    for cores in (1, 2):
        hours[cores] = backup_hours(
            week_kwh_15,
            cores,
            profile_annual_kwh=profile_annual_kwh,
            home_annual_kwh=home_annual_kwh,
            storm_factor=storm_factor,
        )
        for order, (length, weight) in durations.items():
            homes, dark = coverage(length, weight, hours[cores])
            covered[order][cores] = {"homes": homes, "hours": dark}
    return {"hours": hours, "covered": covered}


def week_kwh(
    directory: Path,
    start: date,
    profile_type: str,
    weather_zone: str,
    n_days: int = 7,
) -> np.ndarray:
    """15-minute kWh for `n_days` starting on `start`, across year boundaries if needed."""
    parts: list[np.ndarray] = []
    day = start
    left = n_days
    while left:
        source = yearly_zip(day.year, directory)
        year_left = (date(day.year, 12, 31) - day).days + 1
        take = min(left, year_left)
        parts.append(span_kwh(source, day, take, profile_type, weather_zone))
        day = day + timedelta(days=take)
        left -= take
    return np.concatenate(parts)


def _format_hours(values: list[float]) -> str:
    cells = []
    for value in values:
        cells.append("inf" if value == float("inf") else f"{value:.1f}")
    return " ".join(f"{cell:>6}" for cell in cells)


def _hours_text(value: float) -> str:
    return "inf" if value == float("inf") else f"{value:.1f}h"


class ProfileYears:
    """ERCOT profile days by date for one profile, loading each year's workbook once."""

    def __init__(self, profile_type: str, weather_zone: str, directory: Path = settings.RAW_ERCOT_DIR,
                 cache_dir: Path | None = settings.ERCOT_CACHE_DIR):
        self.profile_type = profile_type
        self.weather_zone = weather_zone
        self.directory = directory
        self.cache_dir = cache_dir
        self._days: dict[date, np.ndarray] = {}
        self._annual: dict[int, float] = {}
        self._failed: dict[int, Exception] = {}

    def _load(self, year: int) -> None:
        if year in self._annual:
            return
        if year in self._failed:
            raise self._failed[year]
        try:
            self._read(year)
        except (FileNotFoundError, ValueError) as error:
            self._failed[year] = error
            raise

    def _read(self, year: int) -> None:
        if self.cache_dir is None:
            days = profile_days_by_month(yearly_zip(year, self.directory), self.profile_type, self.weather_zone)
        else:
            demo_codes = tuple(
                profile_code(settings.DEMO_PROFILE[fips], settings.DEMO_WEATHER_ZONE[fips])
                for fips in settings.DEMO_FIPS
            )
            days = cached_days_by_month(
                year, self.profile_type, self.weather_zone, also=demo_codes,
                directory=self.directory, cache_dir=self.cache_dir,
            )
        self._annual[year] = annual_kwh(days)
        for month in days.values():
            for day, trace in month:
                self._days[day] = trace

    def annual_kwh(self, year: int) -> float:
        self._load(year)
        return self._annual[year]

    def month_traces(self, year: int, month: int) -> list[np.ndarray]:
        self._load(year)
        return [trace for day, trace in sorted(self._days.items()) if day.year == year and day.month == month]

    def span(self, start: date, n_days: int) -> np.ndarray:
        needed = [start + timedelta(days=offset) for offset in range(n_days)]
        for year in sorted({day.year for day in needed}):
            self._load(year)
        missing = [day.isoformat() for day in needed if day not in self._days]
        if missing:
            raise ValueError(f"missing profile days: {', '.join(missing)}")
        return np.concatenate([self._days[day] for day in needed])


def event_local_date(start) -> date:
    """Central-time calendar date of an event start stored in UTC."""
    return pd.Timestamp(start).tz_convert("America/Chicago").date()


def replay_event(
    series: pd.Series,
    event: pd.Series,
    profiles: ProfileYears,
    storm_factor: float = 1.0,
    n_days: int = 7,
) -> dict[str, dict]:
    """Replay one stored event row on the profile week that starts on its local date.

    The profile year is the home, so this is the typical customer of that profile.
    """
    day = event_local_date(event["start"])
    trace = profiles.span(day, n_days)
    annual = profiles.annual_kwh(day.year)
    curve = event_curve(series, event["start"], event["end"])
    return replay_coverage(
        curve, trace, profile_annual_kwh=annual, home_annual_kwh=annual,
        storm_factor=storm_factor,
    )


def largest_in_month(events: pd.DataFrame, fips: str, year: int, month: int) -> pd.Series:
    """The county's largest event by customer-hours that starts in a Central-time month."""
    part = events.loc[events["county_fips"].astype(str) == fips]
    local = pd.to_datetime(part["start"], utc=True).dt.tz_convert("America/Chicago")
    picked = part.loc[(local.dt.year == year) & (local.dt.month == month)]
    if picked.empty:
        raise ValueError(f"no {fips} event in {year}-{month:02d}")
    return picked.sort_values("customer_hours", ascending=False).iloc[0]


def replay_demo() -> int:
    """Replay the freeze and the Harris July 2024 storm on the demo profiles."""
    events = pd.read_parquet(settings.EVENTS_PARQUET)
    series = demo_series()
    picks = [
        ("48085", 2021, 2, "Feb 2021 freeze"),
        ("48201", 2021, 2, "Feb 2021 freeze"),
        ("48201", 2024, 7, "Jul 2024"),
        ("48453", 2021, 2, "Feb 2021 freeze"),
    ]
    profiles = {
        fips: ProfileYears(settings.DEMO_PROFILE[fips], settings.DEMO_WEATHER_ZONE[fips])
        for fips in settings.DEMO_FIPS
    }
    print("storm replay, typical profile customer, battery starts full")
    print("profile week starts at midnight Central on the event's local date")
    for fips, year, month, label in picks:
        row = largest_in_month(events, fips, year, month)
        normal = replay_event(series[fips], row, profiles[fips])
        storm = replay_event(series[fips], row, profiles[fips], storm_factor=STORM_LOAD_FACTOR)
        local = pd.Timestamp(row["start"]).tz_convert("America/Chicago")
        print(
            f"{settings.DEMO_COUNTIES[fips]} {label}  {local:%Y-%m-%d %H:%M} CT  "
            f"peak {row['peak_out_pct']:.1f}%  "
            f"{settings.DEMO_PROFILE[fips]}_{settings.DEMO_WEATHER_ZONE[fips]}"
        )
        _print_replay("normal", normal)
        _print_replay("storm", storm)
    return 0


def _print_replay(label: str, result: dict) -> None:
    for cores in (1, 2):
        hours = _hours_text(result["hours"][cores])
        rotate = result["covered"]["rotate"][cores]
        stay = result["covered"]["stay"][cores]
        print(
            f"  {cores} Core {label:<6} {hours:>7}  "
            f"rotate homes {rotate['homes']:.0%} hours {rotate['hours']:.0%}  "
            f"stay homes {stay['homes']:.0%} hours {stay['hours']:.0%}"
        )


def main() -> int:
    if len(sys.argv) > 1 and sys.argv[1] == "replay":
        return replay_demo()
    year = 2024
    source = yearly_zip(year)
    print(f"typical-profile backup hours from the {year} ERCOT workbook")
    print("month                          J     F     M     A     M     J     J     A     S     O     N     D")
    for fips, county in settings.DEMO_COUNTIES.items():
        zone = settings.DEMO_WEATHER_ZONE[fips]
        profile = settings.DEMO_PROFILE[fips]
        normal = monthly_backup(source, profile, zone)
        storm = monthly_backup(source, profile, zone, storm_factor=STORM_LOAD_FACTOR)
        annual = normal["profile_annual_kwh"]
        print(f"{county} {profile}_{zone}  profile year {annual:.0f} kWh")
        print(f"  1 Core normal {_format_hours(normal['cores_1'])}")
        print(f"  2 Core normal {_format_hours(normal['cores_2'])}")
        print(f"  1 Core storm  {_format_hours(storm['cores_1'])}")
        print(f"  2 Core storm  {_format_hours(storm['cores_2'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
