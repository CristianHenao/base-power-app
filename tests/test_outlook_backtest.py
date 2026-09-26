import numpy as np
import pandas as pd
import pytest

from pipeline.outlook import backtest_outlook, poisson_deviance


def test_perfect_forecast_has_zero_deviance():
    assert poisson_deviance([2.0, 0.0, 4.0], [2.0, 0.0, 4.0]) == pytest.approx(0.0)


def test_zero_mean_with_a_count_is_infinite():
    assert poisson_deviance([1.0], [0.0]) == float("inf")


def test_backtest_scores_four_forecasts():
    fips = [f"48{i:03d}" for i in range(8)]
    train_events = pd.Series([1, 2, 3, 4, 8, 9, 10, 11], index=fips, dtype=float)
    train_years = pd.Series(5.0, index=fips)
    test_events = pd.Series([0.4, 0.8, 1.2, 1.6, 3.2, 3.6, 4.0, 4.4], index=fips)
    test_years = pd.Series(2.0, index=fips)
    zone = pd.Series(["NCENT"] * 4 + ["COAST"] * 4, index=fips)
    scores = backtest_outlook(train_events, train_years, test_events, test_years, zone)
    assert list(scores.index) == ["empirical_bayes", "zone_mean", "statewide_mean", "raw_rate"]
    assert scores["poisson_deviance"].ge(0).all()
    assert np.isnan(scores.loc["statewide_mean", "spearman"])
    assert scores.loc["raw_rate", "spearman"] == pytest.approx(1.0)


def test_zone_shrinkage_beats_a_noisy_raw_rate():
    rng = np.random.default_rng(1)
    n = 40
    fips = [f"48{i:03d}" for i in range(n)]
    true = np.array([0.15] * 20 + [1.5] * 20)
    train_years = np.array([1.0] * 4 + [8.0] * 16 + [1.0] * 4 + [8.0] * 16)
    test_years = np.full(n, 10.0)
    train_events = rng.poisson(true * train_years).astype(float)
    test_events = rng.poisson(true * test_years).astype(float)
    zone = pd.Series(["NCENT"] * 20 + ["COAST"] * 20, index=fips)
    scores = backtest_outlook(
        pd.Series(train_events, index=fips),
        pd.Series(train_years, index=fips),
        pd.Series(test_events, index=fips),
        pd.Series(test_years, index=fips),
        zone,
    )
    assert scores.loc["empirical_bayes", "poisson_deviance"] < scores.loc["raw_rate", "poisson_deviance"]
    assert scores.loc["empirical_bayes", "spearman"] > scores.loc["raw_rate", "spearman"]


def test_backtest_rejects_a_missing_county():
    idx = ["48085", "48201"]
    events = pd.Series([1.0, 2.0], index=idx)
    years = pd.Series(5.0, index=idx)
    zone = pd.Series(["NCENT"], index=["48085"])
    with pytest.raises(ValueError, match="zone"):
        backtest_outlook(events, years, events, years, zone)


@pytest.mark.parametrize("years, level", [(2.0, 5), (3.0, 5), (4.4, 4), (6.0, 4), (9.0, 3), (10.7, 2), (15.0, 2), (40.0, 1)])
def test_outlook_level_uses_fixed_bands(years, level):
    from pipeline.outlook import outlook_level

    assert outlook_level(years) == level


def test_dispersion_is_one_for_whole_events_and_smaller_for_shares():
    from pipeline.outlook import dispersion

    assert dispersion([1.0, 1.0, 0.0]) == 1.0
    assert dispersion([0.1, 0.3]) == pytest.approx((0.01 + 0.09) / 0.4)


def test_quasi_poisson_scale_weakens_the_prior():
    from pipeline.outlook import shrink_rates

    events = np.array([0.2, 0.2, 2.0, 0.2])
    years = np.full(4, 8.0)
    plain, _, _ = shrink_rates(events, years)
    scaled, _, _ = shrink_rates(events, years, phi=0.3)
    assert scaled[2] > plain[2]
