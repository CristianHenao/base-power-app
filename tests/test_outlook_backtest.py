import numpy as np
import pandas as pd
import pytest

from pipeline.outlook import backtest_outlook, poisson_deviance


def test_perfect_forecast_has_zero_deviance():
    assert poisson_deviance([2.0, 0.0, 4.0], [2.0, 0.0, 4.0]) == pytest.approx(0.0)


def test_zero_mean_with_a_count_is_infinite():
    assert poisson_deviance([1.0], [0.0]) == float("inf")


def test_backtest_scores_three_forecasts():
    fips = [f"48{i:03d}" for i in range(8)]
    train_events = pd.Series([1, 2, 3, 4, 8, 9, 10, 11], index=fips, dtype=float)
    train_years = pd.Series(5.0, index=fips)
    test_events = pd.Series([0.4, 0.8, 1.2, 1.6, 3.2, 3.6, 4.0, 4.4], index=fips)
    test_years = pd.Series(2.0, index=fips)
    zone = pd.Series(["NCENT"] * 4 + ["COAST"] * 4, index=fips)
    scores = backtest_outlook(train_events, train_years, test_events, test_years, zone)
    assert list(scores.index) == ["empirical_bayes", "statewide_mean", "raw_rate"]
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
