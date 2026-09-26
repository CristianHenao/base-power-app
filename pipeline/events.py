"""Outage events and per-home durations from EAGLE-I county time series.

EAGLE-I reports how many customers are out in a county every 15 minutes, not who.
We cut the series into events, then replay each event as a queue (rises = homes going
dark, falls = homes restored) under two orderings. FIFO and LIFO give the same
customer-hours but bracket the duration tail, so we report both as a band.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass

import numpy as np
import pandas as pd

STEP_H = 0.25  # EAGLE-I resolution: 15 minutes


@dataclass(frozen=True)
class EventConfig:
    min_customers: int = 50        # absolute floor for "an outage is happening"
    min_frac: float = 0.001        # or 0.1% of modeled customers, whichever is larger
    merge_gap_steps: int = 4       # merge gaps shorter than 1 hour
    min_steps: int = 2             # drop events shorter than 30 minutes


def customer_durations(customers_out, dt_h: float = STEP_H, order: str = "fifo"):
    """Split one event curve into per-customer durations (hours) and customer weights."""
    if order not in ("fifo", "lifo"):
        raise ValueError("order must be 'fifo' or 'lifo'")
    c = np.asarray(customers_out, dtype=float)
    steps = np.diff(np.concatenate(([0.0], c, [0.0])))  # open and close at zero
    waiting: deque = deque()                            # [step_went_dark, customers]
    durations, weights = [], []
    for t, delta in enumerate(steps):
        if delta > 0:
            waiting.append([t, delta])
            continue
        restored = -delta
        while restored > 1e-9 and waiting:
            batch = waiting[0] if order == "fifo" else waiting[-1]
            take = min(batch[1], restored)
            durations.append((t - batch[0]) * dt_h)
            weights.append(take)
            batch[1] -= take
            restored -= take
            if batch[1] <= 1e-9:
                if order == "fifo":
                    waiting.popleft()
                else:
                    waiting.pop()
    return np.asarray(durations, dtype=float), np.asarray(weights, dtype=float)


def weighted_quantile(values, weights, q: float) -> float:
    values, weights = np.asarray(values, float), np.asarray(weights, float)
    if values.size == 0 or weights.sum() <= 0:
        return float("nan")
    order = np.argsort(values)
    v, w = values[order], weights[order]
    cum = (np.cumsum(w) - 0.5 * w) / w.sum()
    return float(np.interp(q, cum, v))


def event_curve(series: pd.Series, start, end) -> np.ndarray:
    """Customers out on the same 15-minute grid `extract_events` used.

    `end` is exclusive, matching the timestamp stored on an event row.
    """
    s = series.sort_index().astype(float)
    s = s[~s.index.duplicated(keep="last")].asfreq("15min", fill_value=0.0)
    start = pd.Timestamp(start)
    end = pd.Timestamp(end)
    if start.tzinfo is None:
        start = start.tz_localize("UTC")
    if end.tzinfo is None:
        end = end.tz_localize("UTC")
    start, end = start.tz_convert("UTC"), end.tz_convert("UTC")
    if start not in s.index or end <= start:
        raise ValueError("event window is missing from the county series")
    last = end - pd.Timedelta(minutes=15)
    if last not in s.index:
        raise ValueError("event window is missing from the county series")
    return s.loc[start:last].to_numpy(dtype=float)


def coverage(durations, weights, backup_h: float) -> tuple[float, float]:
    """(share of affected homes fully covered, share of their dark hours covered)."""
    d, w = np.asarray(durations, float), np.asarray(weights, float)
    if w.sum() <= 0:
        return 1.0, 1.0
    homes = w[d <= backup_h].sum() / w.sum()
    dark = (w * d).sum()
    hours = 1.0 if dark <= 0 else (w * np.minimum(d, backup_h)).sum() / dark
    return float(homes), float(hours)


def extract_events(series: pd.Series, customers_total: float,
                   cfg: EventConfig = EventConfig()) -> list[dict]:
    """Cut one county's customers-out series (DatetimeIndex, 15-min) into events.

    Missing timestamps are treated as zero, which is how EAGLE-I stores quiet periods.
    Model-card caveat: zeros can also be scraping gaps during big storms.
    """
    if series.empty:
        return []
    s = series.sort_index().astype(float)
    s = s[~s.index.duplicated(keep="last")].asfreq("15min", fill_value=0.0)
    threshold = max(cfg.min_customers, cfg.min_frac * customers_total)
    hot = np.flatnonzero(s.to_numpy() >= threshold)
    if hot.size == 0:
        return []

    # group threshold crossings, merging gaps shorter than merge_gap_steps
    splits = np.flatnonzero(np.diff(hot) - 1 >= cfg.merge_gap_steps) + 1
    events = []
    for run in np.split(hot, splits):
        start, end = int(run[0]), int(run[-1])
        if end - start + 1 < cfg.min_steps:
            continue
        curve = s.iloc[start:end + 1].to_numpy()
        row = {
            "start": s.index[start],
            "end": s.index[end] + pd.Timedelta(minutes=15),
            "peak_out": float(curve.max()),
            "peak_out_pct": float(100 * curve.max() / customers_total) if customers_total else float("nan"),
            "customer_hours": float(curve.sum() * STEP_H),
        }
        for order in ("fifo", "lifo"):
            d, w = customer_durations(curve, order=order)
            row[f"p50_h_{order}"] = weighted_quantile(d, w, 0.5)
            row[f"p90_h_{order}"] = weighted_quantile(d, w, 0.9)
            row[f"share_12h_{order}"] = float(w[d >= 12].sum() / customers_total) if customers_total else 0.0
        events.append(row)
    return events
