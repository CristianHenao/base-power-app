"""County outage outlook: long-outage rate per typical home, shrunk with empirical Bayes."""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

LEVELS = ["Low", "Moderate", "Elevated", "High", "Very high"]


def shrink_rates(events, years, floor_cv: float = 0.25):
    """Gamma-Poisson empirical Bayes. Returns (posterior mean, 5th pct, 95th pct).

    events: effective long-outage count per county (fractional is fine)
    years:  years of usable coverage per county
    Fit separately within each ERCOT weather zone.
    """
    events, years = np.asarray(events, float), np.asarray(years, float)
    if np.any(years <= 0):
        raise ValueError("years must be positive")
    rate = events / years
    mean = np.average(rate, weights=years)
    if mean <= 0:
        zeros = np.zeros_like(rate)
        return zeros, zeros, zeros
    raw_var = np.average((rate - mean) ** 2, weights=years)
    noise = mean * np.average(1.0 / years, weights=years)       # expected Poisson share
    var_between = max(raw_var - noise, (floor_cv * mean) ** 2)   # floor keeps the prior honest
    beta = mean / var_between
    alpha = mean * beta
    a_post, b_post = alpha + events, beta + years
    lo, hi = stats.gamma.ppf([[0.05], [0.95]], a_post, scale=1.0 / b_post)
    return a_post / b_post, lo, hi


def county_outlook(events: pd.DataFrame, years: pd.Series, zone: pd.Series,
                   order: str = "lifo") -> pd.DataFrame:
    """Outlook table indexed by county_fips.

    events: rows from extract_events plus a county_fips column.
    years, zone: Series indexed by county_fips (years of usable coverage, ERCOT weather zone).
    LIFO is the conservative (long-tail) default for 12h+ shares.
    """
    col = f"share_12h_{order}"
    counts = events.groupby("county_fips")[col].sum().reindex(years.index, fill_value=0.0)
    parts = []
    for z, idx in zone.groupby(zone).groups.items():
        post, lo, hi = shrink_rates(counts.loc[idx], years.loc[idx])
        parts.append(pd.DataFrame({
            "weather_zone": z, "long_outages_per_year": post,
            "lo90": lo, "hi90": hi, "years_of_data": years.loc[idx],
        }, index=idx))
    df = pd.concat(parts)
    cuts = df["long_outages_per_year"].quantile([0.2, 0.4, 0.6, 0.8]).to_numpy()
    df["level"] = np.searchsorted(cuts, df["long_outages_per_year"].to_numpy(), side="right") + 1
    df["label"] = [LEVELS[i - 1] for i in df["level"]]
    rate = df["long_outages_per_year"].to_numpy()
    df["once_every_years"] = np.where(rate > 0, 1.0 / np.where(rate > 0, rate, 1.0), np.inf)
    return df


def poisson_deviance(observed, expected) -> float:
    """Total Poisson deviance. A zero count against a zero mean contributes nothing.

    A positive count against a zero mean is infinite: that forecast said the
    county could not have an outage.
    """
    observed = np.asarray(observed, dtype=float)
    expected = np.asarray(expected, dtype=float)
    if observed.shape != expected.shape:
        raise ValueError("observed and expected must have the same shape")
    if np.any(observed < 0) or np.any(expected < 0):
        raise ValueError("counts must be non-negative")
    if np.any((observed > 0) & (expected == 0)):
        return float("inf")
    usable = ~((observed == 0) & (expected == 0))
    y, mu = observed[usable], expected[usable]
    log_term = np.zeros_like(y)
    positive = y > 0
    log_term[positive] = y[positive] * np.log(y[positive] / mu[positive])
    return float(2.0 * np.sum(log_term - (y - mu)))


def _spearman(predicted_rate, observed_rate) -> float:
    predicted = np.asarray(predicted_rate, dtype=float)
    observed = np.asarray(observed_rate, dtype=float)
    if np.unique(predicted).size < 2 or np.unique(observed).size < 2:
        return float("nan")
    result = stats.spearmanr(predicted, observed)
    value = getattr(result, "statistic", result.correlation)
    return float(value)


def backtest_outlook(
    train_events: pd.Series,
    train_years: pd.Series,
    test_events: pd.Series,
    test_years: pd.Series,
    zone: pd.Series,
) -> pd.DataFrame:
    """Score 2023–2024 counts from a prior fit on 2018–2022.

    Three forecasts, each turned into an expected count with the test years:
    empirical Bayes within the weather zone, one statewide mean rate, and the
    county's own raw train rate. Lower Poisson deviance is better. Spearman
    compares the predicted rate with the observed test rate.
    """
    idx = train_events.index
    columns = {
        "train_events": train_events,
        "train_years": train_years,
        "test_events": test_events,
        "test_years": test_years,
        "zone": zone,
    }
    aligned = {}
    for name, series in columns.items():
        values = series.reindex(idx)
        if values.isna().any():
            raise ValueError(f"{name} is missing counties")
        aligned[name] = values
    if np.any(aligned["train_years"].to_numpy() <= 0) or np.any(aligned["test_years"].to_numpy() <= 0):
        raise ValueError("years must be positive")

    eb_rate = pd.Series(index=idx, dtype=float)
    for members in aligned["zone"].groupby(aligned["zone"]).groups.values():
        posterior, _, _ = shrink_rates(
            aligned["train_events"].loc[members], aligned["train_years"].loc[members]
        )
        eb_rate.loc[members] = posterior
    raw_rate = aligned["train_events"] / aligned["train_years"]
    statewide = float(np.average(raw_rate.to_numpy(), weights=aligned["train_years"].to_numpy()))
    forecasts = {
        "empirical_bayes": eb_rate,
        "statewide_mean": pd.Series(statewide, index=idx),
        "raw_rate": raw_rate,
    }
    observed_rate = aligned["test_events"] / aligned["test_years"]
    rows = []
    for name, rate in forecasts.items():
        expected = rate.to_numpy() * aligned["test_years"].to_numpy()
        rows.append({
            "method": name,
            "poisson_deviance": poisson_deviance(aligned["test_events"].to_numpy(), expected),
            "spearman": _spearman(rate.to_numpy(), observed_rate.to_numpy()),
        })
    return pd.DataFrame(rows).set_index("method")
