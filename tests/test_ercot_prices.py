import pandas as pd
import pytest

from pipeline.sources.ercot_prices import check, tidy_month


def _month(rows: list[tuple[str, int, int, str]]) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "Delivery Date": date,
                "Delivery Hour": hour,
                "Delivery Interval": interval,
                "Repeated Hour Flag": flag,
                "Settlement Point Name": "LZ_NORTH",
                "Settlement Point Type": "LZ",
                "Settlement Point Price": 25.0,
            }
            for date, hour, interval, flag in rows
        ]
    )


def test_fall_back_hour_gets_two_distinct_utc_intervals() -> None:
    # 2024-11-03: hour ending 2, interval 1 happens at 01:00 CDT and again at 01:00 CST.
    out = tidy_month(_month([("11/03/2024", 2, 1, "N"), ("11/03/2024", 2, 1, "Y")]))
    assert out["interval_start_utc"].tolist() == [
        pd.Timestamp("2024-11-03 06:00", tz="UTC"),
        pd.Timestamp("2024-11-03 07:00", tz="UTC"),
    ]
    check(out)


def test_hour_ending_and_interval_become_interval_start() -> None:
    # Hour ending 1, interval 1 is 00:00-00:15 local; January is CST (UTC-6).
    out = tidy_month(_month([("01/15/2024", 1, 1, "N"), ("01/15/2024", 24, 4, "N")]))
    assert out["interval_start_utc"].tolist() == [
        pd.Timestamp("2024-01-15 06:00", tz="UTC"),
        pd.Timestamp("2024-01-16 05:45", tz="UTC"),
    ]


def test_spring_forward_gap_is_rejected() -> None:
    # 02:00 local on 2024-03-10 does not exist; ERCOT skips hour ending 3.
    with pytest.raises(Exception):
        tidy_month(_month([("03/10/2024", 3, 1, "N")]))


def test_check_catches_unflagged_duplicates() -> None:
    out = tidy_month(_month([("01/15/2024", 1, 1, "N"), ("01/15/2024", 1, 1, "N")]))
    with pytest.raises(ValueError):
        check(out)


def test_footer_row_is_dropped() -> None:
    month = _month([("01/15/2024", 1, 1, "N")])
    footer = {column: None for column in month.columns} | {"Delivery Date": "2025-01-01 00:00:00"}
    out = tidy_month(pd.concat([month, pd.DataFrame([footer])], ignore_index=True))
    assert len(out) == 1


def test_lz_and_lzew_for_the_same_zone_are_not_duplicates() -> None:
    month = _month([("01/15/2024", 1, 1, "N"), ("01/15/2024", 1, 1, "N")])
    month.loc[1, "Settlement Point Type"] = "LZEW"
    check(tidy_month(month))
