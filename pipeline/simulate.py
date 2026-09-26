"""Backup hours from ERCOT profile workbooks.

When no home annual kWh is passed, the profile's own year is the home. That is
the typical customer of that profile, and it is still an estimate.
"""
from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np

from api.app.sim.backup import STORM_LOAD_FACTOR, hours_by_month
from pipeline import settings
from pipeline.sources.ercot_profiles import (
    annual_kwh,
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


def main() -> int:
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
