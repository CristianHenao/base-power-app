import pandas as pd

from pipeline.hazards import label_hazards, named_storm_hazard


def _ts(text: str) -> pd.Timestamp:
    return pd.Timestamp(text, tz="UTC")


def test_named_storms_map_to_hazards():
    assert named_storm_hazard("Hurricane Beryl") == "tropical"
    assert named_storm_hazard("Winter Storm Mara (ice storm)") == "winter"
    assert named_storm_hazard("Houston derecho") == "wind"
    assert named_storm_hazard(None) is None


def test_named_storm_wins_then_noaa_by_severity_then_other():
    events = pd.DataFrame({
        "county_fips": ["48201", "48201", "48453", "48001"],
        "start": [_ts("2024-07-08 14:00"), _ts("2023-05-01 12:00"), _ts("2021-02-15 06:00"), _ts("2022-01-01")],
        "storm": ["Hurricane Beryl", None, None, None],
    })
    noaa = pd.DataFrame({
        "county_fips": ["48201", "48201", "48453", "48453"],
        "begin_utc": [_ts("2023-05-01 10:00"), _ts("2023-05-01 13:00"), _ts("2021-02-14 20:00"), _ts("2021-02-15 01:00")],
        "end_utc": [_ts("2023-05-01 11:00"), _ts("2023-05-01 15:00"), _ts("2021-02-16"), _ts("2021-02-15 02:00")],
        "event_type": ["Flash Flood", "Thunderstorm Wind", "Winter Storm", "Heat"],
    })
    assert label_hazards(events, noaa).tolist() == ["tropical", "wind", "winter", "other"]


def test_noaa_far_from_the_outage_does_not_label_it():
    events = pd.DataFrame({"county_fips": ["48201"], "start": [_ts("2023-05-03")], "storm": [None]})
    noaa = pd.DataFrame({"county_fips": ["48201"], "begin_utc": [_ts("2023-05-01")], "end_utc": [_ts("2023-05-01 06:00")],
                         "event_type": ["Tornado"]})
    assert label_hazards(events, noaa).tolist() == ["other"]
