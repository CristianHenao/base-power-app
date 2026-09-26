"""Statewide events, the county outlook, and its backtest.

Run: python -m pipeline.backtest
Writes events for every Texas county, the outlook table, and backtest.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

from pipeline import settings
from pipeline.covariates import county_covariates, design
from pipeline.events import EventConfig
from pipeline.outlook import backtest_outlook, county_outlook, zone_dispersion
from pipeline.sources.eaglei import (
    columns_from_settings,
    concat_yearly,
    county_series,
    events_frame,
    keep_from,
    keep_texas,
    list_yearly_csvs,
    load_customers,
    write_events,
)

DAYS_PER_YEAR = 365.25


def _utc(value) -> pd.Timestamp:
    stamp = pd.Timestamp(value)
    return stamp.tz_localize("UTC") if stamp.tzinfo is None else stamp.tz_convert("UTC")


def first_seen(frame: pd.DataFrame) -> pd.Series:
    """First reading per county. Counties with no rows are left out."""
    return frame.groupby("county_fips")["timestamp"].min()


def years_in_window(first: pd.Series, start, end) -> pd.Series:
    """Years each county was reporting inside [start, end)."""
    start, end = _utc(start), _utc(end)
    begin = first.where(first > start, start)
    days = (end - begin).dt.total_seconds() / 86_400
    return (days / DAYS_PER_YEAR).clip(lower=0.0)


def long_counts(events: pd.DataFrame, start, end, order: str = settings.LONG_OUTAGE_ORDER) -> pd.Series:
    """Effective 12-hour-plus outages per typical home, summed over events starting in [start, end)."""
    start, end = _utc(start), _utc(end)
    stamps = pd.to_datetime(events["start"], utc=True)
    inside = events.loc[(stamps >= start) & (stamps < end)]
    return inside.groupby("county_fips")[f"share_12h_{order}"].sum()


def load_zones(path: Path, fips: pd.Index) -> tuple[pd.Series, str]:
    """County weather zones from the crosswalk, or one statewide group if it is missing."""
    if not path.exists():
        return pd.Series(settings.STATEWIDE_ZONE, index=fips), "statewide"
    table = pd.read_csv(path, dtype={"county_fips": "string", "weather_zone": "string"})
    zones = table.set_index(table["county_fips"].str.zfill(5))["weather_zone"]
    missing = sorted(set(fips) - set(zones.index))
    if missing:
        raise ValueError(f"{path.name} has no weather zone for {', '.join(missing[:5])}")
    return zones.reindex(fips), "weather_zone"


def floored_counties(frame: pd.DataFrame, customers: dict[str, float]) -> pd.Series:
    """True where a county's peak customers out exceeds its modeled count, so the peak is used."""
    peak = frame.groupby("county_fips")["customers_out"].max()
    modeled = pd.Series(customers, dtype=float).reindex(peak.index)
    return (peak > modeled).rename("customers_floored")


def statewide_events(frame: pd.DataFrame, customers: dict[str, float], cfg: EventConfig = EventConfig()) -> pd.DataFrame:
    """Events for every Texas county that has both readings and a modeled customer count."""
    series = {
        fips: county_series(part, fips)
        for fips, part in frame.groupby("county_fips")
        if fips in customers
    }
    return events_frame(series, customers, cfg)


def run_backtest(events: pd.DataFrame, first: pd.Series, zones: pd.Series,
                 covariates: pd.DataFrame | None = None) -> tuple[pd.DataFrame, int]:
    """Scores, and how many counties had no long outages in training but some in testing.

    Those counties make the raw rate's deviance infinite.
    """
    train_start, train_end = settings.BACKTEST_TRAIN
    test_start, test_end = settings.BACKTEST_TEST
    train_years = years_in_window(first, train_start, train_end)
    test_years = years_in_window(first, test_start, test_end)
    usable = train_years.index[(train_years > 0) & (test_years > 0)]
    train = long_counts(events, train_start, train_end).reindex(usable, fill_value=0.0)
    test = long_counts(events, test_start, test_end).reindex(usable, fill_value=0.0)
    col = f"share_12h_{settings.LONG_OUTAGE_ORDER}"
    stamps = pd.to_datetime(events["start"], utc=True)
    train_rows = events.loc[(stamps >= _utc(train_start)) & (stamps < _utc(train_end))]
    phi = zone_dispersion(train_rows, zones, col)
    x = None
    if covariates is not None:
        usable = usable[usable.isin(covariates.index)]
        train, test = train.reindex(usable), test.reindex(usable)
        x = design(covariates.reindex(usable), tuple(settings.WEATHER_ZONES))
    scores = backtest_outlook(train, train_years[usable], test, test_years[usable], zones[usable], phi, x)
    surprises = int(((train == 0) & (test > 0)).sum())
    return scores, surprises


def build_outlook(events: pd.DataFrame, first: pd.Series, zones: pd.Series, data_end: pd.Timestamp) -> pd.DataFrame:
    years = years_in_window(first, settings.RATES_START, data_end)
    years = years[years > 0]
    table = county_outlook(events, years, zones[years.index], order=settings.LONG_OUTAGE_ORDER)
    table.index.name = "county_fips"
    return table.sort_index()


def _json_value(value: float) -> float | str | None:
    """JSON has no infinity. Infinite deviance is written as the string "inf"."""
    if value is None or np.isnan(value):
        return None
    if np.isinf(value):
        return "inf"
    return round(float(value), 4)


def backtest_record(scores: pd.DataFrame, prior_scope: str, counties: int, surprises: int) -> dict:
    return {
        "train": list(settings.BACKTEST_TRAIN),
        "test": list(settings.BACKTEST_TEST),
        "metric": f"12h+ outages per typical home ({settings.LONG_OUTAGE_ORDER.upper()} durations)",
        "prior_scope": prior_scope,
        "counties": counties,
        "zero_train_counties_with_test_outages": surprises,
        "methods": {
            method: {
                "poisson_deviance": _json_value(row["poisson_deviance"]),
                "spearman": _json_value(row["spearman"]),
            }
            for method, row in scores.iterrows()
        },
    }


def main() -> int:
    columns = columns_from_settings()
    if columns is None:
        print("EAGLE-I column map in pipeline/settings.py is unset")
        return 1
    customers = {fips: n for fips, n in load_customers(settings.CUSTOMERS_CSV).items() if fips.startswith("48")}
    frame = keep_from(
        keep_texas(concat_yearly(list_yearly_csvs(settings.RAW_EAGLEI_DIR), columns)),
        _utc(settings.RATES_START),
    )
    data_end = frame["timestamp"].max() + pd.Timedelta(minutes=15)
    first = first_seen(frame)
    first = first[first.index.isin(list(customers))]
    events = statewide_events(frame, customers)
    write_events(events, settings.TEXAS_EVENTS_PARQUET)

    zones, scope = load_zones(settings.COUNTY_WEATHER_ZONE_CSV, first.index)
    outlook = build_outlook(events, first, zones, data_end)
    outlook["customers_floored"] = floored_counties(frame, customers).reindex(outlook.index, fill_value=False)
    settings.OUTLOOK_PARQUET.parent.mkdir(parents=True, exist_ok=True)
    outlook.to_parquet(settings.OUTLOOK_PARQUET)

    covariates = None
    if settings.COUNTY_UTILITY_CSV.exists() and settings.FEATURES_DUCKDB.exists():
        try:
            covariates = county_covariates(settings.FEATURES_DUCKDB, settings.COUNTY_UTILITY_CSV, customers)
        except duckdb.Error as error:  # county_layers is built later by pipeline.map_layers
            print(f"no covariates ({error}); scoring without the covariate model")
    scores, surprises = run_backtest(events, first, zones, covariates)
    record = backtest_record(scores, scope, int(len(first)), surprises)
    settings.BACKTEST_JSON.write_text(json.dumps(record, indent=2) + "\n")

    print(f"{len(events):,} events across {events['county_fips'].nunique()} counties, data through {data_end:%Y-%m-%d}")
    if scope == "statewide":
        print(f"no crosswalk at {settings.COUNTY_WEATHER_ZONE_CSV}; the prior is fit statewide")
    print("backtest: fit 2018-2022, score 2023-2024")
    print(scores.to_string(float_format=lambda v: f"{v:.3f}"))
    print(f"{surprises} counties had no 12h+ outages in training and some in testing")
    print(f"{int(outlook['customers_floored'].sum())} counties use their peak customers out as the customer count")
    demo = outlook.loc[outlook.index.isin(list(settings.DEMO_FIPS))]
    print(demo[["long_outages_per_year", "lo90", "hi90", "level", "label", "once_every_years", "years_of_data"]]
          .to_string(float_format=lambda v: f"{v:.3f}"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
