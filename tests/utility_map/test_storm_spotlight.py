import pandas as pd
import pytest

from pipeline.utility_map.storm_spotlight import storm_counties


def test_storm_counties_sum_customer_hours_and_keep_the_worst_peak() -> None:
    events = pd.DataFrame({
        "county_fips": ["48201", "48201", "48167", "48001"],
        "start": pd.to_datetime(["2024-07-08 09:00", "2024-07-10 00:00", "2024-07-08 10:00", "2024-07-08 11:00"], utc=True),
        "end": pd.to_datetime(["2024-07-12", "2024-07-11", "2024-07-09", "2024-07-09"], utc=True),
        "peak_out": [1_500_000.0, 20_000.0, 40_000.0, 10.0],
        "peak_out_pct": [60.0, 1.0, 45.0, 0.1],
        "customer_hours": [9.0e7, 1.0e5, 1.0e6, 5.0],
    })
    labels = pd.DataFrame({
        "county_fips": ["48201", "48201", "48167"],
        "start": pd.to_datetime(["2024-07-08 09:00", "2024-07-10 00:00", "2024-07-08 10:00"], utc=True),
        "storm": ["Hurricane Beryl"] * 3,
    })
    out = storm_counties(events, labels, "Hurricane Beryl")
    assert [c["fips"] for c in out] == ["48201", "48167"]
    harris = out[0]
    assert harris["peak_out"] == 1_500_000
    assert harris["peak_out_pct"] == pytest.approx(60.0)
    assert harris["customer_hours"] == pytest.approx(9.01e7)
