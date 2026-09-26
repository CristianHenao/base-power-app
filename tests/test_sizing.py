import pandas as pd
import pytest

from pipeline.features import event_ids
from pipeline.sizing import covered_share, long_hours, size_cores, sizing_reason


def test_long_hours_count_only_homes_out_twelve_hours_or_more():
    covered, total = long_hours([6.0, 20.0], [100.0, 10.0], backup_h=15.0)
    assert total == pytest.approx(200.0)
    assert covered == pytest.approx(150.0)


def test_covered_share_pools_hours_across_events():
    assert covered_share([(150.0, 200.0), (50.0, 50.0)]) == pytest.approx(0.8)
    assert covered_share([]) == 1.0


def test_two_cores_when_one_falls_short_of_ninety_percent():
    assert size_cores({1: 0.62, 2: 0.93}) == 2
    assert size_cores({1: 0.91, 2: 0.99}) == 1


def test_reason_states_the_share_and_install_check():
    text = sizing_reason(2, {1: 0.62, 2: 0.93}, "Collin", 2018)
    assert text == (
        "Two Cores would have covered 93% of the 12-hour-plus outage hours in Collin County "
        "since 2018. Base confirms sizing at install."
    )


def test_reason_when_no_option_reaches_the_target():
    text = sizing_reason(2, {1: 0.40, 2: 0.70}, "Harris", 2018)
    assert "70%" in text and "the most of the options we model" in text


def test_reason_rounds_down_so_a_miss_never_reads_as_the_target():
    text = sizing_reason(2, {1: 0.59, 2: 0.899}, "Travis", 2018)
    assert "89%" in text and "90%" not in text
    assert "29%" in sizing_reason(1, {1: 0.29, 2: 0.5}, "Travis", 2018)


def test_event_ids_use_the_central_date_and_suffix_collisions():
    events = pd.DataFrame(
        {
            "county_fips": ["48085", "48085", "48201"],
            "start": pd.to_datetime(
                ["2021-02-15 01:00", "2021-02-14 15:15", "2021-02-15 05:15"], utc=True,
            ),
        }
    )
    assert event_ids(events).tolist() == ["48085-2021-02-14-2", "48085-2021-02-14", "48201-2021-02-14"]
