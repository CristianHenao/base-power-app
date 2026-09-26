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
