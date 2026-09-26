"""Backup simulator: walk a household load trace down one or more Base Cores.

Specs from Base's public site: 39.2 kWh and 20 kW per Core. Starting state of charge
and any reserve floor are assumptions; confirm them with Base engineers.
"""
from __future__ import annotations

import numpy as np

KWH_PER_CORE = 39.2
KW_PER_CORE = 20.0
STEP_H = 0.25
# Storm mode is a labeled 30% load reduction. Base has not published the factor.
STORM_LOAD_FACTOR = 0.7
# Base keeps about 20% in reserve during grid work, so an outage nobody forecast can start there.
RESERVE_SOC = 0.2
TYPICAL_DAY_HOURS = 24.0 * 14


def scale_to_home(profile_kwh_15, profile_annual_kwh: float, home_annual_kwh: float) -> np.ndarray:
    """ERCOT profile values are kWh per 15 minutes. Scale to the home, keep the seasonal
    shape, and return kW."""
    if profile_annual_kwh <= 0:
        raise ValueError("profile_annual_kwh must be positive")
    factor = home_annual_kwh / profile_annual_kwh
    return np.asarray(profile_kwh_15, float) * factor / STEP_H


def hours_until_empty(load_kw, cores: int = 1, start_soc: float = 1.0,
                      storm_factor: float = 1.0, dt_h: float = STEP_H) -> tuple[float, bool]:
    """Hours of backup (np.inf if the trace ends first) and whether load exceeded inverter power."""
    if cores < 1 or not 0.0 <= start_soc <= 1.0 or storm_factor <= 0:
        raise ValueError("need cores >= 1, 0 <= start_soc <= 1, storm_factor > 0")
    load = np.asarray(load_kw, float) * storm_factor
    max_kw = KW_PER_CORE * cores
    overload = bool((load > max_kw).any())
    load = np.clip(load, 1e-9, max_kw)
    energy = KWH_PER_CORE * cores * start_soc
    used = np.cumsum(load) * dt_h
    i = int(np.searchsorted(used, energy))
    if i >= used.size:
        return float("inf"), overload
    prev = used[i - 1] if i > 0 else 0.0
    return float((i + (energy - prev) / (load[i] * dt_h)) * dt_h), overload


def tile_day(day_kwh, min_hours: float = TYPICAL_DAY_HOURS) -> np.ndarray:
    """Repeat one day's 15-minute kWh until the trace is at least `min_hours` long."""
    day = np.asarray(day_kwh, float)
    if day.size == 0:
        raise ValueError("day is empty")
    repeats = int(np.ceil(min_hours / (day.size * STEP_H)))
    return np.tile(day, max(repeats, 1))


def backup_hours(kwh_15, cores: int = 1, *, profile_annual_kwh: float,
                 home_annual_kwh: float, storm_factor: float = 1.0,
                 start_soc: float = 1.0) -> float:
    """Hours until the Core is empty. The trace's kWh are scaled to the home first."""
    load_kw = scale_to_home(kwh_15, profile_annual_kwh, home_annual_kwh)
    hours, _overload = hours_until_empty(
        load_kw, cores=cores, storm_factor=storm_factor, start_soc=start_soc,
    )
    return hours


def hours_by_month(typical_days, *, profile_annual_kwh: float, home_annual_kwh: float,
                   storm_factor: float = 1.0, start_soc: float = 1.0) -> dict[str, list[float]]:
    """Backup hours for one and two Cores, one typical day per month, January first."""
    days = list(typical_days)
    if len(days) != 12:
        raise ValueError("expected 12 monthly typical days")
    cores_1: list[float] = []
    cores_2: list[float] = []
    for day in days:
        tiled = tile_day(day)
        cores_1.append(backup_hours(
            tiled, 1, profile_annual_kwh=profile_annual_kwh,
            home_annual_kwh=home_annual_kwh, storm_factor=storm_factor, start_soc=start_soc,
        ))
        cores_2.append(backup_hours(
            tiled, 2, profile_annual_kwh=profile_annual_kwh,
            home_annual_kwh=home_annual_kwh, storm_factor=storm_factor, start_soc=start_soc,
        ))
    return {"cores_1": cores_1, "cores_2": cores_2}


def recommend_cores(hours_covered_by_cores: dict[int, float], target: float = 0.9) -> int:
    """Smallest Core count covering at least `target` of historical long-outage hours."""
    for n in sorted(hours_covered_by_cores):
        if hours_covered_by_cores[n] >= target:
            return n
    return max(hours_covered_by_cores)
