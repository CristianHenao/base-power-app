import numpy as np
import pandas as pd
import pytest

from api.app.sim.backup import KWH_PER_CORE
from pipeline.grid_value import ROUND_TRIP, daily_arbitrage, zone_year_value
from pipeline.sources.ercot_prices import load_zone_prices, zone_and_hub_prices


def test_cheap_then_expensive_day_fills_once_and_empties():
    prices = np.array([10.0] * 48 + [100.0] * 48)
    eta = np.sqrt(ROUND_TRIP)
    expected = (KWH_PER_CORE * eta * 100.0 - KWH_PER_CORE / eta * 10.0) / 1000.0
    assert daily_arbitrage(prices) == pytest.approx(expected, rel=1e-6)


def test_flat_prices_earn_nothing():
    assert daily_arbitrage(np.full(96, 40.0)) == pytest.approx(0.0, abs=1e-9)


def test_power_limit_caps_a_one_interval_spike():
    prices = np.array([0.0] * 95 + [5000.0])
    eta = np.sqrt(ROUND_TRIP)
    # 20 kW for 15 minutes is 5 kWh out of the battery, whatever is stored.
    assert daily_arbitrage(prices) == pytest.approx(5.0 * 5000.0 / 1000.0, rel=1e-6)
    assert daily_arbitrage(prices) < KWH_PER_CORE * eta * 5.0


def test_load_zone_prices_drop_hubs_and_use_utc():
    raw = pd.DataFrame({
        "Interval Start": pd.to_datetime(["2024-11-03 01:00", "2024-11-03 01:00"]).tz_localize("US/Central", ambiguous=[True, True]),
        "Location": ["LZ_HOUSTON", "HB_HOUSTON"],
        "Location Type": ["Load Zone", "Trading Hub"],
        "SPP": [20.0, 21.0],
    })
    out = load_zone_prices(raw)
    assert out["load_zone"].tolist() == ["LZ_HOUSTON"]
    assert str(out["interval_start_utc"].iloc[0]) == "2024-11-03 06:00:00+00:00"


def test_zone_year_value_counts_scarcity_intervals():
    stamps = pd.date_range("2024-07-01", periods=96, freq="15min", tz="America/Chicago").tz_convert("UTC")
    prices = pd.DataFrame({
        "interval_start_utc": stamps,
        "load_zone": "LZ_NORTH",
        "spp": [30.0] * 94 + [1500.0, 2500.0],
    })
    table = zone_year_value(prices)
    row = table.iloc[0]
    assert row["year"] == 2024 and row["days"] == 1
    assert row["scarcity_intervals"] == 2
    assert row["arbitrage_usd_upper_bound"] > 0


def _raw(types: list[str], locations: list[str]) -> pd.DataFrame:
    return pd.DataFrame({
        "Interval Start": pd.to_datetime(["2025-01-01 00:00"] * len(types)).tz_localize("US/Central"),
        "Location": locations,
        "Location Type": types,
        "SPP": [17.9 + i for i in range(len(types))],
    })


def test_energy_weighted_load_zones_are_dropped():
    raw = _raw(["Load Zone", "Load Zone Energy Weighted", "Trading Hub"], ["LZ_NORTH", "LZ_NORTH", "HB_NORTH"])
    out = zone_and_hub_prices(raw)
    assert out[["location", "location_type"]].values.tolist() == [["HB_NORTH", "hub"], ["LZ_NORTH", "load_zone"]]


def test_two_prices_for_one_interval_fail_fast():
    raw = _raw(["Load Zone", "Load Zone"], ["LZ_NORTH", "LZ_NORTH"])
    with pytest.raises(ValueError, match="repeated interval-location"):
        zone_and_hub_prices(raw)
