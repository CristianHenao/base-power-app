"""Long-outage hours per customer and 12-hour backup coverage by county, from EAGLE-I (UM-2.1).

For every outage event in a county's 15-minute customers-out series, per-home durations
come from pipeline.events (the "stay" reading from settings.LONG_OUTAGE_ORDER: the same
homes stay dark while the count is above them). Durations of 12 hours or more count as
long outages; all their dark hours count, not just the hours past 12.

  long_hours_per_customer_year = Σ long-outage customer-hours ÷ (customers × years observed)
  coverage_12h                 = Σ min(d, 12 h) × homes ÷ Σ d × homes, over long outages only

EAGLE-I lists a county only while customers are out, so absent rows are quiet periods.
Years observed run from the county's first reading to the end of the data, the same
convention as the homeowner report's outlook (pipeline.backtest.years_in_window).

Run: python -m pipeline.utility_map.outages
"""
from __future__ import annotations

import sys

import numpy as np
import pandas as pd

from pipeline import settings
from pipeline.backtest import first_seen, years_in_window
from pipeline.events import customer_durations, customers_floor, extract_events
from pipeline.sources.eaglei import load_customers
from pipeline.utility_map.manifest import record

LONG_H = 12.0
BACKUP_H = 12.0  # conservative end of Base's 12-18 h typical backup (docs/battery-tech-specs.md)
MIN_YEARS = 5.0
SERIES = settings.REPO_ROOT / "data" / "processed" / "eaglei_tx.parquet"
OUT = settings.UTILITY_MAP_DIR / "county_outages.parquet"


def reporting_years(first: pd.Series, start, end) -> pd.Series:
    return years_in_window(first, start, end)


def county_long_outages(
    series: pd.Series, customers_total: float, years: float, min_years: float = MIN_YEARS
) -> dict:
    """series: customers out every 15 minutes (UTC index), rows only while customers are out."""
    series = series.dropna()
    long_hours = covered = 0.0
    for event in extract_events(series, customers_total):
        curve = series.loc[event["start"]: event["end"] - pd.Timedelta(minutes=15)].to_numpy(dtype=float)
        durations, weights = customer_durations(curve, order=settings.LONG_OUTAGE_ORDER)
        long = durations >= LONG_H
        long_hours += float((durations[long] * weights[long]).sum())
        covered += float((np.minimum(durations[long], BACKUP_H) * weights[long]).sum())
    ok = years >= min_years and customers_total > 0
    return {
        "long_hours_per_customer_year": (long_hours / (customers_total * years)) if ok else None,
        "coverage_12h": (covered / long_hours) if ok and long_hours > 0 else None,
        "years_observed": years,
        "long_customer_hours": long_hours,
        "quality": "ok" if ok else "missing",
    }


def main() -> int:
    frame = pd.read_parquet(SERIES, columns=["county_fips", "customers_out", "timestamp"])
    customers = load_customers(settings.RAW_DIR / "reference" / "MCC.csv")
    data_end = frame["timestamp"].max() + pd.Timedelta(minutes=15)
    years = reporting_years(first_seen(frame), settings.RATES_START, data_end)
    rows = []
    for fips, part in frame.groupby("county_fips", sort=True):
        series = part.set_index("timestamp")["customers_out"].sort_index()
        series = series[~series.index.duplicated(keep="last")]
        total = customers_floor(customers.get(fips, 0.0), series)
        rows.append({"county_fips": fips, **county_long_outages(series, total, float(years.get(fips, 0.0)))})
    out = pd.DataFrame(rows)[["county_fips", "long_hours_per_customer_year", "coverage_12h", "years_observed",
                              "long_customer_hours", "quality"]]
    out.to_parquet(OUT, index=False)
    record("eaglei_long_outages", "https://doi.org/10.6084/m9.figshare.24237376", SERIES, rows=len(frame),
           period_start=str(frame["timestamp"].min().date()), period_end=str(frame["timestamp"].max().date()),
           note="County 15-minute customers-out series (data/processed/eaglei_tx.parquet), EAGLE-I 2018-2025.")
    print(out.describe().round(3).to_string())
    print(out.set_index("county_fips").loc[list(settings.DEMO_FIPS) + ["48167", "48355"]].round(3).to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main())
