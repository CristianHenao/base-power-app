import numpy as np
import pandas as pd
import pytest

from pipeline.events import EventConfig, coverage, customer_durations, extract_events
from pipeline.outlook import county_outlook, shrink_rates
from api.app.sim.backup import KWH_PER_CORE, hours_until_empty, recommend_cores


def storm_curve():
    rng = np.random.default_rng(0)
    up = np.linspace(0, 40_000, 24)
    down = 40_000 * np.exp(-np.arange(288) / 60.0) + rng.normal(0, 300, 288)
    return np.clip(np.concatenate([up, down]), 0, None)


@pytest.mark.parametrize("order", ["fifo", "lifo"])
def test_durations_conserve_customer_hours(order):
    c = storm_curve()
    d, w = customer_durations(c, order=order)
    assert (d * w).sum() == pytest.approx(c.sum() * 0.25, rel=1e-9)


def test_lifo_has_longer_tail_than_fifo():
    c = storm_curve()
    assert customer_durations(c, order="lifo")[0].max() >= customer_durations(c, order="fifo")[0].max()


def test_coverage_bounds():
    d, w = customer_durations(storm_curve())
    assert coverage(d, w, 1e9) == pytest.approx((1.0, 1.0))
    assert coverage(d, w, 0.0)[1] == pytest.approx(0.0)


def test_extract_events_merges_short_gaps_and_drops_blips():
    idx = pd.date_range("2024-07-08", periods=40, freq="15min")
    s = pd.Series(0.0, index=idx)
    s.iloc[2:10] = 5_000   # event part 1
    s.iloc[12:20] = 4_000  # 2-step gap, merged into the same event
    s.iloc[30] = 9_000     # single-step blip, dropped
    events = extract_events(s, customers_total=100_000, cfg=EventConfig())
    assert len(events) == 1
    assert events[0]["peak_out"] == 5_000


def test_constant_load_reproduces_base_36_hours():
    load = np.full(96 * 5, KWH_PER_CORE / 36.0)  # ~1.09 kW average
    hours, overload = hours_until_empty(load, cores=1)
    assert hours == pytest.approx(36.0, rel=1e-6)
    assert not overload


def test_backup_scales_with_cores_and_storm_mode():
    load = np.full(96 * 7, 2.5)
    one, _ = hours_until_empty(load, cores=1)
    two, _ = hours_until_empty(load, cores=2)
    storm, _ = hours_until_empty(load, cores=1, storm_factor=0.7)
    assert two == pytest.approx(2 * one)
    assert storm > one


def test_short_trace_returns_inf():
    assert hours_until_empty(np.full(8, 0.5))[0] == float("inf")


def test_recommend_cores():
    assert recommend_cores({1: 0.78, 2: 0.95}) == 2
    assert recommend_cores({1: 0.93, 2: 0.99}) == 1


def test_empirical_bayes_beats_raw_rates():
    rng = np.random.default_rng(1)
    true = rng.gamma(1.2, 0.5, 40)
    years = rng.integers(2, 8, 40).astype(float)
    obs = rng.poisson(true * years)
    post, lo, hi = shrink_rates(obs, years)
    assert np.mean((post - true) ** 2) < np.mean((obs / years - true) ** 2)
    assert np.all(lo <= post) and np.all(post <= hi)


def test_county_outlook_shapes_and_levels():
    fips = [f"48{i:03d}" for i in range(1, 11)]
    events = pd.DataFrame({"county_fips": fips * 2, "share_12h_lifo": np.linspace(0, 0.5, 20)})
    years = pd.Series(7.0, index=fips)
    zone = pd.Series(["NCENT"] * 5 + ["COAST"] * 5, index=fips)
    out = county_outlook(events, years, zone)
    assert set(out.index) == set(fips)
    assert out["level"].between(1, 5).all()
