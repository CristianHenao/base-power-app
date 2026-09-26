import pandas as pd

from pipeline.storms import STORMS_YAML, Storm, label_events, load_storms


def _storm(name: str, start: str, end: str, zones: set[str] | None) -> Storm:
    return Storm(
        name,
        pd.Timestamp(start, tz="America/Chicago").tz_convert("UTC"),
        pd.Timestamp(end, tz="America/Chicago").tz_convert("UTC"),
        None if zones is None else frozenset(zones),
    )


ZONES = pd.Series({"48201": "COAST", "48453": "SCENT"})


def _events(rows: list[tuple[str, str, str]]) -> pd.DataFrame:
    return pd.DataFrame(
        [{"county_fips": fips, "start": pd.Timestamp(start, tz="UTC"), "end": pd.Timestamp(end, tz="UTC"),
          "peak_out_pct": 5.0}
         for fips, start, end in rows]
    )


def test_event_inside_window_and_zone_gets_the_name() -> None:
    storms = [_storm("Hurricane Beryl", "2024-07-07", "2024-07-20", {"COAST"})]
    events = _events([("48201", "2024-07-08 14:00", "2024-07-19 05:00")])
    assert label_events(events, ZONES, storms).tolist() == ["Hurricane Beryl"]


def test_event_outside_the_storm_zone_stays_unnamed() -> None:
    storms = [_storm("Hurricane Beryl", "2024-07-07", "2024-07-20", {"COAST"})]
    events = _events([("48453", "2024-07-08 14:00", "2024-07-09 05:00")])
    assert label_events(events, ZONES, storms).tolist() == [None]


def test_statewide_storm_and_larger_overlap_wins() -> None:
    storms = [
        _storm("Short", "2021-02-10", "2021-02-12", None),
        _storm("Winter Storm Uri", "2021-02-11", "2021-02-22", None),
    ]
    events = _events([("48453", "2021-02-14 18:00", "2021-02-21 14:00")])
    assert label_events(events, ZONES, storms).tolist() == ["Winter Storm Uri"]


def test_reference_file_loads_with_ordered_windows() -> None:
    storms = load_storms(STORMS_YAML)
    assert len(storms) >= 6
    assert all(storm.start < storm.end for storm in storms)
    uri = next(storm for storm in storms if storm.name == "Winter Storm Uri")
    assert uri.zones is None


def test_small_event_during_a_storm_stays_unnamed() -> None:
    storms = [_storm("Hurricane Beryl", "2024-07-07", "2024-07-20", {"COAST"})]
    events = _events([("48201", "2024-07-10 14:00", "2024-07-10 18:00")])
    events["peak_out_pct"] = 0.2
    assert label_events(events, ZONES, storms).tolist() == [None]
