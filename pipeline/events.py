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


def _as_utc(series: pd.Series) -> pd.Series:
    s = series.sort_index()
    s = s[~s.index.duplicated(keep="last")]
    s = pd.to_numeric(s, errors="coerce")
    if s.index.tz is None:
        return s.tz_localize("UTC")
    return s.tz_convert("UTC")


def _reported_runs(series: pd.Series) -> list[pd.Series]:
    """Contiguous 15-minute stretches of reported counts.

    A null count and a missing timestamp both end the stretch. Reported zeros stay,
    so a source-reported quiet interval can still end or merge an event. Nothing
    here inserts a zero for an interval the observation record does not contain.
    """
    s = _as_utc(series).dropna()
    if s.empty:
        return []
    step = pd.Timedelta(minutes=15)
    breaks = s.index.to_series().diff().ne(step)
    breaks.iloc[0] = False
    return [run for _, run in s.groupby(breaks.cumsum(), sort=False)]


def event_curve(series: pd.Series, start, end) -> np.ndarray:
    """Customers out on the same 15-minute grid `extract_events` used.

    `end` is exclusive, matching the timestamp stored on an event row.
    The window must already be fully reported. Missing slots are not filled with zero.
    """
    s = _as_utc(series)
    start = pd.Timestamp(start)
    end = pd.Timestamp(end)
    if start.tzinfo is None:
        start = start.tz_localize("UTC")
    if end.tzinfo is None:
        end = end.tz_localize("UTC")
    start, end = start.tz_convert("UTC"), end.tz_convert("UTC")
    last = end - pd.Timedelta(minutes=15)
    if end <= start or start not in s.index or last not in s.index:
        raise ValueError("event window is missing from the county series")
    window = s.loc[start:last]
    expected = pd.date_range(start, last, freq="15min", tz="UTC")
    if window.isna().any() or not window.index.equals(expected):
        raise ValueError("event window is missing from the county series")
    return window.to_numpy(dtype=float)


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

    The series is the observation record. A reported zero is a reported zero.
    A null count or a missing 15-minute timestamp ends the observed run and is
    not read as customers restored. Reported quiet gaps shorter than an hour
    still merge; unobserved gaps do not.
    """
    events: list[dict] = []
    for run in _reported_runs(series):
        events.extend(_events_in_run(run, customers_total, cfg))
    return events


def _events_in_run(s: pd.Series, customers_total: float, cfg: EventConfig) -> list[dict]:
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
