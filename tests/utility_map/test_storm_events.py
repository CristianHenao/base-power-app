from pathlib import Path

import pandas as pd
import pytest

from pipeline.utility_map.storm_events import normalize, parse_damage, zone_counties


def _row(**overrides) -> dict:
    row = {
        "EVENT_ID": 1, "EPISODE_ID": 10, "STATE_FIPS": 48, "EVENT_TYPE": "Flash Flood", "CZ_TYPE": "C",
        "CZ_FIPS": 201, "BEGIN_YEARMONTH": 201708, "BEGIN_DAY": 27, "BEGIN_TIME": 130,
        "END_YEARMONTH": 201708, "END_DAY": 28, "END_TIME": 2359, "CZ_TIMEZONE": "CST-6",
        "INJURIES_DIRECT": 1, "INJURIES_INDIRECT": 0, "DEATHS_DIRECT": 2, "DEATHS_INDIRECT": 1,
        "DAMAGE_PROPERTY": "1.5M", "DAMAGE_CROPS": "0.00K", "MAGNITUDE": None,
        "BEGIN_LAT": 29.76, "BEGIN_LON": -95.37,
    }
    return row | overrides


@pytest.fixture()
def zones(tmp_path: Path) -> dict[str, list[str]]:
    path = tmp_path / "bp.dbx"
    path.write_text(
        "TX|213|HGX|Harris|TX213|Harris|48201|C|se|29.8|-95.4\n"
        "TX|300|HGX|Galveston Island|TX300|Galveston|48167|C|se|29.3|-94.8\n"
        "TX|300|HGX|Galveston Island|TX300|Brazoria|48039|C|se|29.2|-95.2\n"
        "NM|201|ABQ|Northwest Plateau|NM201|McKinley|35031|M|nw|36.4|-108.4\n"
    )
    return zone_counties(path)


def test_zone_file_maps_texas_zones_to_county_fips(zones: dict[str, list[str]]) -> None:
    assert zones == {"TX213": ["48201"], "TX300": ["48039", "48167"]}


@pytest.mark.parametrize("text, value", [("1.5M", 1.5e6), ("2.5K", 2500.0), ("0.00K", 0.0), ("3B", 3e9),
                                         ("", None), (None, None), ("12", 12.0)])
def test_damage_strings(text, value) -> None:
    assert parse_damage(text) == value


def test_county_event_keeps_its_county_and_converts_time(zones) -> None:
    out = normalize(pd.DataFrame([_row()]), zones)
    row = out.iloc[0]
    assert row["county_fips"] == "48201"
    assert row["begin_utc"] == pd.Timestamp("2017-08-27 07:30", tz="UTC")
    assert row["begin_local_date"] == pd.Timestamp("2017-08-27").date()
    assert row["damage_usd"] == 1.5e6
    assert row["deaths"] == 3 and row["injuries"] == 1
    assert not row["via_zone"]


def test_zone_event_expands_to_each_county_and_other_states_are_dropped(zones) -> None:
    frame = pd.DataFrame([
        _row(EVENT_ID=2, CZ_TYPE="Z", CZ_FIPS=300, EVENT_TYPE="Storm Surge/Tide", BEGIN_LAT=None, BEGIN_LON=None),
        _row(EVENT_ID=3, STATE_FIPS=35),
        _row(EVENT_ID=4, CZ_TYPE="M", CZ_FIPS=330),
    ])
    out = normalize(frame, zones)
    assert sorted(out["county_fips"]) == ["48039", "48167"]
    assert out["via_zone"].all()
    assert set(out["event_id"]) == {2}
