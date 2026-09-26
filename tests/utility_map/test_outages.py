import numpy as np
import pandas as pd
import pytest

from pipeline.utility_map.outages import county_long_outages


def _year_with_outage(out_hours: float, customers_out: float) -> pd.Series:
    index = pd.date_range("2023-01-01", "2024-01-01", freq="15min", tz="UTC", inclusive="left")
    values = np.zeros(len(index))
    start = 4 * 24 * 100  # April
    values[start:start + int(out_hours * 4)] = customers_out
    return pd.Series(values, index=index)


def test_one_long_outage_gives_hours_per_customer_year_and_12h_coverage() -> None:
    row = county_long_outages(_year_with_outage(20, 100), customers_total=1000, years=1.0, min_years=1)
    assert row["long_hours_per_customer_year"] == pytest.approx(2.0, rel=1e-2)
    assert row["coverage_12h"] == pytest.approx(0.6)
    assert row["years_observed"] == 1.0
    assert row["quality"] == "ok"


def test_short_outages_do_not_count_as_long() -> None:
    row = county_long_outages(_year_with_outage(6, 500), customers_total=1000, years=1.0, min_years=1)
    assert row["long_hours_per_customer_year"] == 0.0
    assert row["coverage_12h"] is None  # no qualifying hours, so no coverage claim


def test_too_few_observed_years_is_missing() -> None:
    row = county_long_outages(_year_with_outage(20, 100), customers_total=1000, years=3.0, min_years=5)
    assert row["quality"] == "missing"


def test_rows_missing_for_quiet_periods_do_not_shrink_the_rate() -> None:
    # EAGLE-I only lists counties with customers out, so a quiet county has few rows.
    series = _year_with_outage(20, 100)
    sparse = series[series > 0]
    row = county_long_outages(sparse, customers_total=1000, years=1.0, min_years=1)
    assert row["long_hours_per_customer_year"] == pytest.approx(2.0)


def test_years_come_from_first_reading_to_data_end() -> None:
    from pipeline.utility_map.outages import reporting_years

    first = pd.Series({"48001": pd.Timestamp("2018-01-01", tz="UTC"), "48003": pd.Timestamp("2022-01-01", tz="UTC")})
    years = reporting_years(first, "2018-01-01", "2026-01-01")
    assert years["48001"] == pytest.approx(8.0, rel=1e-3)
    assert years["48003"] == pytest.approx(4.0, rel=1e-3)
