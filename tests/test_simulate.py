import numpy as np
import pytest

from api.app.sim.backup import KWH_PER_CORE, STEP_H, STORM_LOAD_FACTOR, hours_by_month


def _constant_day() -> np.ndarray:
    kw = KWH_PER_CORE / 36.0
    return np.full(96, kw * STEP_H)


def test_hours_by_month_matches_constant_load():
    days = [_constant_day() for _ in range(12)]
    table = hours_by_month(days, profile_annual_kwh=1.0, home_annual_kwh=1.0)
    assert table["cores_1"] == pytest.approx([36.0] * 12)
    assert table["cores_2"] == pytest.approx([72.0] * 12)


def test_storm_mode_lengthens_backup():
    days = [_constant_day() for _ in range(12)]
    storm = hours_by_month(
        days, profile_annual_kwh=1.0, home_annual_kwh=1.0, storm_factor=STORM_LOAD_FACTOR,
    )
    assert storm["cores_1"][0] == pytest.approx(36.0 / STORM_LOAD_FACTOR)
    assert storm["cores_1"][0] > 36.0


def test_hours_by_month_rejects_a_short_year():
    with pytest.raises(ValueError, match="12"):
        hours_by_month([np.ones(96)] * 11, profile_annual_kwh=1.0, home_annual_kwh=1.0)


def test_hours_by_month_from_the_reserve_floor():
    from api.app.sim.backup import RESERVE_SOC, hours_by_month

    flat = [np.full(96, 0.25)] * 12  # 1 kW
    table = hours_by_month(flat, profile_annual_kwh=1.0, home_annual_kwh=1.0, start_soc=RESERVE_SOC)
    assert table["cores_1"] == pytest.approx([39.2 * 0.2] * 12)
    assert table["cores_2"] == pytest.approx([78.4 * 0.2] * 12)
