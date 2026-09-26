import datetime as dt

import pandas as pd
import pytest

from pipeline.utility_map.hazard_layers import combined_rank, event_days_per_year


def _events(rows: list[tuple[str, str, str]]) -> pd.DataFrame:
    return pd.DataFrame({
        "county_fips": [r[0] for r in rows],
        "event_type": [r[1] for r in rows],
        "begin_local_date": [dt.date.fromisoformat(r[2]) for r in rows],
    })


def test_event_days_count_each_county_day_once() -> None:
    events = _events([
        ("48201", "Flash Flood", "2017-08-27"),
        ("48201", "Flash Flood", "2017-08-27"),  # same day, second report
        ("48201", "Flood", "2017-08-28"),
        ("48201", "Hail", "2017-08-28"),          # not a flood type
        ("48167", "Coastal Flood", "2020-09-20"),
    ])
    days = event_days_per_year(events, {"Flood", "Flash Flood", "Coastal Flood"}, years=2,
                               counties=["48201", "48167", "48001"])
    assert days.to_dict() == {"48201": 1.0, "48167": 0.5, "48001": 0.0}


def test_combined_rank_is_the_mean_of_component_ranks_and_keeps_missing_parts_out() -> None:
    a = pd.Series({"x": 1.0, "y": 2.0, "z": 3.0})
    b = pd.Series({"x": 3.0, "y": 2.0, "z": None})
    rank = combined_rank([a, b])
    assert rank["x"] == pytest.approx((0.0 + 1.0) / 2)
    assert rank["y"] == pytest.approx((0.5 + 0.0) / 2)
    assert rank["z"] == pytest.approx(1.0)
