import numpy as np
import pandas as pd
import pytest

from pipeline.durations import WeibullAFT, compress, season_of


def test_seasons_follow_meteorological_quarters():
    assert [season_of(m) for m in (12, 1, 3, 6, 9, 11)] == ["winter", "winter", "spring", "summer", "fall", "fall"]


def test_compress_keeps_homes_and_floors_short_durations():
    points, homes = compress(np.array([0.1, 10.0]), np.array([50.0, 50.0]), k=4)
    assert homes == 25.0 and points.min() == 0.25 and points.max() == 10.0


def test_weibull_aft_recovers_group_scales():
    rng = np.random.default_rng(0)
    n = 4000
    group = np.where(np.arange(n) % 2 == 0, "a", "b")
    scale = np.where(group == "a", 5.0, 40.0)
    hours = scale * rng.weibull(1.5, n)
    frame = pd.DataFrame({"g": group, "hours": np.maximum(hours, 0.01), "homes": 1.0})
    model = WeibullAFT({"g": ("a", "b")}, scale_factor="g").fit(frame)
    median = model.quantile(pd.DataFrame({"g": ["a", "b"]}), 0.5)
    truth = scale[:2] * np.log(2) ** (1 / 1.5)
    assert median == pytest.approx(truth, rel=0.08)
    assert model.mean_loglik(frame) > WeibullAFT({}, scale_factor=None).fit(frame).mean_loglik(frame)


def test_severity_bins_by_peak_share():
    from pipeline.durations import severity_of

    assert [severity_of(v) for v in (0.05, 0.1, 2.0, 50.0)] == ["<0.1%", "0.1-1%", "1-3%", ">30%"]
