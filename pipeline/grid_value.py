"""Grid value by load zone: what one Core could earn with perfect foresight.

Run: python -m pipeline.grid_value   (after pipeline.sources.ercot_prices)

Each Central-time day is a small linear program: charge and discharge one
20 kW, 39.2 kWh unit against that day's real-time prices, starting empty.
Knowing every price in advance makes this an upper bound, not a forecast.
The count of 15-minute intervals above $1,000/MWh is reported beside it.
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd
from scipy.optimize import linprog
from scipy.sparse import diags, hstack, identity

from api.app.sim.backup import KW_PER_CORE, KWH_PER_CORE, STEP_H
from pipeline import settings
from pipeline.sources.ercot_prices import read_prices

ROUND_TRIP = 0.9
SCARCITY_PRICE = 1000.0  # $/MWh


def daily_arbitrage(prices_mwh, kw: float = KW_PER_CORE, kwh: float = KWH_PER_CORE,
                    round_trip: float = ROUND_TRIP, dt_h: float = STEP_H) -> float:
    """Best revenue in dollars for one day of prices, starting empty.

    Variables are charge c_t and discharge d_t in kW and stored energy s_t in kWh:
    s_t = s_{t-1} + eta * c_t * dt - d_t * dt / eta, with eta = sqrt(round_trip).
    """
    price = np.asarray(prices_mwh, dtype=float)
    n = price.size
    if n == 0:
        return 0.0
    eta = np.sqrt(round_trip)
    to_dollars = dt_h / 1000.0
    cost = np.concatenate([price * to_dollars, -price * to_dollars, np.zeros(n)])
    # s_t - s_{t-1} - eta*dt*c_t + dt/eta*d_t = 0, with s_0 = 0
    storage = identity(n, format="csr") - diags(np.ones(n - 1), -1, format="csr")
    equality = hstack([
        -eta * dt_h * identity(n, format="csr"),
        (dt_h / eta) * identity(n, format="csr"),
        storage,
    ], format="csr")
    bounds = [(0.0, kw)] * (2 * n) + [(0.0, kwh)] * n
    result = linprog(cost, A_eq=equality, b_eq=np.zeros(n), bounds=bounds, method="highs")
    if not result.success:
        raise RuntimeError(f"daily LP failed: {result.message}")
    return float(-result.fun)


def zone_year_value(prices: pd.DataFrame) -> pd.DataFrame:
    """Upper-bound arbitrage, scarcity intervals and mean price per load zone and year."""
    local = prices["interval_start_utc"].dt.tz_convert("America/Chicago")
    frame = prices.assign(day=local.dt.date, year=local.dt.year)
    rows = []
    for (zone, year), part in frame.groupby(["load_zone", "year"], sort=True):
        daily = [daily_arbitrage(day["spp"].to_numpy()) for _, day in part.sort_values("interval_start_utc").groupby("day")]
        rows.append({
            "load_zone": zone,
            "year": int(year),
            "arbitrage_usd_upper_bound": float(np.sum(daily)),
            "scarcity_intervals": int((part["spp"] > SCARCITY_PRICE).sum()),
            "mean_spp": float(part["spp"].mean()),
            "days": len(daily),
        })
    return pd.DataFrame(rows)


def main() -> int:
    prices = read_prices()
    table = zone_year_value(prices)
    settings.GRID_VALUE_PARQUET.parent.mkdir(parents=True, exist_ok=True)
    table.to_parquet(settings.GRID_VALUE_PARQUET, index=False)
    pivot = table.pivot(index="load_zone", columns="year", values="arbitrage_usd_upper_bound")
    print("perfect-foresight arbitrage, one 20 kW / 39.2 kWh unit, $ per year (upper bound)")
    print(pivot.to_string(float_format=lambda v: f"{v:,.0f}"))
    print("intervals above $1,000/MWh")
    print(table.pivot(index="load_zone", columns="year", values="scarcity_intervals").to_string())
    print(f"wrote {settings.GRID_VALUE_PARQUET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
