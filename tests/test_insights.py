from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from pipeline.insights import month_gap, month_hours, storm_week_hours, tail_share, tail_summary


def _events() -> pd.DataFrame:
    return pd.DataFrame({
        "county_fips": ["48085"] * 7 + ["48201"] * 2,
        "customer_hours": [100.0, 50.0, 10.0, 10.0, 10.0, 10.0, 10.0, 30.0, 0.0],
    })


def _flat_year(kwh_per_step: float) -> dict[int, list[tuple[date, np.ndarray]]]:
    days: dict[int, list[tuple[date, np.ndarray]]] = {month: [] for month in range(1, 13)}
    day = date(2024, 1, 1)
    while day.year == 2024:
        days[day.month].append((day, np.full(96, kwh_per_step)))
        day += timedelta(days=1)
    return days


def test_tail_share_takes_each_county_top_n_events():
    table = tail_share(_events(), n=5)
    assert table.at["48085", "events"] == 7
    assert table.at["48085", "top_share"] == pytest.approx(180.0 / 200.0)
    assert table.at["48201", "top_share"] == pytest.approx(1.0)


def test_tail_share_is_nan_when_a_county_has_no_hours():
    events = pd.DataFrame({"county_fips": ["48453"], "customer_hours": [0.0]})
    assert np.isnan(tail_share(events, n=5).at["48453", "top_share"])


def test_tail_share_rejects_n_below_one():
    with pytest.raises(ValueError):
        tail_share(_events(), n=0)


def test_tail_summary_reports_demo_counties_and_spread():
    table = tail_share(_events(), n=5)
    names = pd.Series({"48085": "Collin", "48201": "Harris"})
    summary = tail_summary(table, names, ("48085", "48453"))
    assert summary["counties"] == 2
    assert summary["counties_over_half"] == 2
    assert summary["demo"] == [{"county_fips": "48085", "county": "Collin", "events": 7, "top_share": 0.9}]


def test_flat_load_gives_the_same_hours_every_month():
    # 0.25 kWh per 15 minutes is 1 kW, so one Core lasts 39.2 hours.
    table = month_hours(_flat_year(0.25))
    assert table["cores_1"] == pytest.approx([39.2] * 12)
    assert table["cores_2"] == pytest.approx([78.4] * 12)


def test_storm_week_uses_the_real_days_from_the_start_date():
    days = _flat_year(0.25)
    days[7] = [(day, trace * 2.0 if day >= date(2024, 7, 8) else trace) for day, trace in days[7]]
    hours = storm_week_hours(days, date(2024, 7, 8))
    # The profile is its own home, so the doubled days run at 2 kW.
    assert hours[1] == pytest.approx(19.6)


def test_storm_week_is_inf_when_the_cores_outlast_it():
    hours = storm_week_hours(_flat_year(0.01), date(2024, 3, 1))
    assert hours[2] == float("inf")


def test_storm_week_names_missing_days():
    with pytest.raises(ValueError, match="2025-01-01"):
        storm_week_hours(_flat_year(0.25), date(2024, 12, 30), n_days=3)


def test_month_gap_finds_the_short_and_long_month():
    hours = [20.0] * 12
    hours[7], hours[1] = 10.0, 40.0
    assert month_gap(hours) == {
        "short_month": 8, "short_hours": 10.0, "long_month": 2, "long_hours": 40.0, "ratio": 4.0,
    }
