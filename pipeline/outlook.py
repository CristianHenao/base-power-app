"""County outage outlook: long-outage rate per typical home, shrunk with empirical Bayes."""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy import stats

LEVELS = ["Low", "Moderate", "Elevated", "High", "Very high"]
# Fixed bands on "a 12h+ outage about once every N years": >15, 10-15, 6-10, 3-6, <=3.
# Rates cluster within weather zones, so statewide quintiles flipped on tiny differences.
BAND_YEARS = (15.0, 10.0, 6.0, 3.0)


def outlook_level(once_every_years: float) -> int:
    """1 (Low) to 5 (Very high); each band edge belongs to the higher level."""
    return 1 + sum(once_every_years <= edge for edge in BAND_YEARS)


def dispersion(shares) -> float:
    """Quasi-Poisson scale of a count built from per-event shares: sum(s^2) / sum(s).

    A count of whole events has scale 1. Summing fractional shares is less noisy.
    """
    s = np.asarray(shares, float)
    s = s[s > 0]
    return 1.0 if s.size == 0 else float(np.sum(s ** 2) / np.sum(s))


def shrink_rates(events, years, floor_cv: float = 0.25, phi: float = 1.0):
    """Gamma-Poisson empirical Bayes. Returns (posterior mean, 5th pct, 95th pct).

    events: effective long-outage count per county (fractional is fine)
    years:  years of usable coverage per county
    phi:    quasi-Poisson scale from `dispersion`; counts and years are divided by it
    Fit separately within each ERCOT weather zone.
    """
    if phi <= 0:
        raise ValueError("phi must be positive")
    events, years = np.asarray(events, float), np.asarray(years, float)
    if np.any(years <= 0):
        raise ValueError("years must be positive")
    rate = events / years
    mean = np.average(rate, weights=years)
    if mean <= 0:
        zeros = np.zeros_like(rate)
        return zeros, zeros, zeros
    raw_var = np.average((rate - mean) ** 2, weights=years)
    noise = phi * mean * np.average(1.0 / years, weights=years)  # expected sampling share
    var_between = max(raw_var - noise, (floor_cv * mean) ** 2)   # floor keeps the prior honest
    beta = mean / var_between
    alpha = mean * beta
    a_post, b_post = alpha + events / phi, beta + years / phi
    lo, hi = stats.gamma.ppf([[0.05], [0.95]], a_post, scale=1.0 / b_post)
    return a_post / b_post, lo, hi


def poisson_glm(x: np.ndarray, counts: np.ndarray, exposure: np.ndarray, ridge: float = 1.0) -> np.ndarray:
    """Coefficients of log(rate) = x.beta for fractional counts with exposure in years.

    A small ridge penalty (not on the intercept) keeps zone dummies stable in thin zones.
    """
    from scipy.optimize import minimize

    penalty = np.full(x.shape[1], ridge)
    penalty[0] = 0.0

    def nll(beta: np.ndarray) -> tuple[float, np.ndarray]:
        eta = np.clip(x @ beta, -30, 30)
        mu = exposure * np.exp(eta)
        value = float((mu - counts * eta).sum() + 0.5 * (penalty * beta ** 2).sum())
        grad = x.T @ (mu - counts) + penalty * beta
        return value, grad

    start = np.zeros(x.shape[1])
    start[0] = np.log(max(counts.sum(), 1e-9) / exposure.sum())
    result = minimize(nll, start, jac=True, method="L-BFGS-B")
    if not result.success:
        raise RuntimeError(f"Poisson GLM failed: {result.message}")
    return result.x


def covariate_shrink(events, years, prior_rate, floor_cv: float = 0.25, phi: float = 1.0):
    """Gamma-Poisson shrinkage toward a per-county prior mean (the GLM) instead of one zone mean.

    The between-county spread around the prior is a common coefficient of variation, fit by
    moments with the same quasi-Poisson noise and floor as `shrink_rates`.
    Returns (posterior mean, 5th pct, 95th pct).
    """
    events, years, prior = (np.asarray(v, float) for v in (events, years, prior_rate))
    if np.any(years <= 0) or np.any(prior <= 0):
        raise ValueError("years and prior rates must be positive")
    rate = events / years
    noise = phi * prior / years
    cv2 = np.average(((rate - prior) ** 2 - noise) / prior ** 2, weights=years)
    cv2 = max(cv2, floor_cv ** 2)
    alpha = 1.0 / cv2
    beta = alpha / prior
    a_post, b_post = alpha + events / phi, beta + years / phi
    lo, hi = stats.gamma.ppf([[0.05], [0.95]], a_post, scale=1.0 / b_post)
    return a_post / b_post, lo, hi


def zone_dispersion(events: pd.DataFrame, zone: pd.Series, col: str) -> pd.Series:
    """`dispersion` of the per-event shares within each weather zone."""
    zones = events["county_fips"].map(zone)
    return events[col].groupby(zones).apply(dispersion)


def county_outlook(events: pd.DataFrame, years: pd.Series, zone: pd.Series,
                   order: str = "stay") -> pd.DataFrame:
    """Outlook table indexed by county_fips.

    events: rows from extract_events plus a county_fips column.
    years, zone: Series indexed by county_fips (years of usable coverage, ERCOT weather zone).
    The stay bound is the conservative (long-tail) default for 12h+ shares.
    """
    col = f"share_12h_{order}"
    counts = events.groupby("county_fips")[col].sum().reindex(years.index, fill_value=0.0)
    phis = zone_dispersion(events, zone, col)
    parts = []
    for z, idx in zone.groupby(zone).groups.items():
        post, lo, hi = shrink_rates(counts.loc[idx], years.loc[idx], phi=phis.get(z, 1.0))
        parts.append(pd.DataFrame({
            "weather_zone": z, "long_outages_per_year": post,
            "lo90": lo, "hi90": hi, "years_of_data": years.loc[idx],
        }, index=idx))
    df = pd.concat(parts)
    rate = df["long_outages_per_year"].to_numpy()
    df["once_every_years"] = np.where(rate > 0, 1.0 / np.where(rate > 0, rate, 1.0), np.inf)
    df["level"] = [outlook_level(years) for years in df["once_every_years"]]
    df["label"] = [LEVELS[i - 1] for i in df["level"]]
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
    phi: pd.Series | None = None,
    covariates: np.ndarray | None = None,
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
    zone_rate = pd.Series(index=idx, dtype=float)
    raw_rate = aligned["train_events"] / aligned["train_years"]
    for name, members in aligned["zone"].groupby(aligned["zone"]).groups.items():
        posterior, _, _ = shrink_rates(
            aligned["train_events"].loc[members], aligned["train_years"].loc[members],
            phi=1.0 if phi is None else float(phi.get(name, 1.0)),
        )
        eb_rate.loc[members] = posterior
        zone_rate.loc[members] = np.average(raw_rate.loc[members], weights=aligned["train_years"].loc[members])
    statewide = float(np.average(raw_rate.to_numpy(), weights=aligned["train_years"].to_numpy()))
    forecasts = {}
    if covariates is not None:
        exposure = aligned["train_years"].to_numpy()
        beta = poisson_glm(covariates, aligned["train_events"].to_numpy(), exposure)
        glm_rate = pd.Series(np.exp(covariates @ beta), index=idx)
        phi_all = 1.0 if phi is None else float(np.average(phi.reindex(aligned["zone"]).fillna(1.0)))
        post, _, _ = covariate_shrink(aligned["train_events"], exposure, glm_rate, phi=phi_all)
        forecasts["covariate_bayes"] = pd.Series(post, index=idx)
        forecasts["covariate_glm"] = glm_rate
    forecasts |= {
        "empirical_bayes": eb_rate,
        "zone_mean": zone_rate,
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
