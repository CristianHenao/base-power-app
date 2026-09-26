import pandas as pd
import pytest

from pipeline.utility_map.ercot_load import fallback_peaks, parse_native_load, zone_peaks

ZONES = ["COAST", "EAST", "FWEST", "NORTH", "NCENT", "SOUTH", "SCENT", "WEST"]


def _day(date: str, hours: list[str], load: float = 100.0) -> pd.DataFrame:
    rows = [{"Hour Ending": f"{date} {h}", **{z: load for z in ZONES}, "ERCOT": load * 8} for h in hours]
    return pd.DataFrame(rows)


def test_fall_back_day_keeps_both_repeated_hours() -> None:
    hours = ["01:00", "02:00", "02:00 DST"] + [f"{h:02d}:00" for h in range(3, 25)]
    long = parse_native_load(_day("11/03/2024", hours))
    coast = long.loc[long["weather_zone"] == "COAST", "hour_start_utc"]
    assert len(coast) == 25
    assert coast.is_unique
    assert coast.min() == pd.Timestamp("2024-11-03 05:00", tz="UTC")
    assert coast.max() == pd.Timestamp("2024-11-04 05:00", tz="UTC")


def test_spring_forward_day_has_23_hours() -> None:
    hours = ["01:00", "02:00"] + [f"{h:02d}:00" for h in range(4, 25)]
    long = parse_native_load(_day("03/10/2024", hours))
    coast = long.loc[long["weather_zone"] == "COAST", "hour_start_utc"].sort_values()
    assert len(coast) == 23
    assert (coast.diff().dropna() == pd.Timedelta(hours=1)).all()


def test_older_header_spelling_is_accepted() -> None:
    frame = _day("01/01/2018", ["01:00"]).rename(columns={"Hour Ending": "HourEnding"})
    long = parse_native_load(frame)
    assert long["hour_start_utc"].iloc[0] == pd.Timestamp("2018-01-01 06:00", tz="UTC")
    assert "ERCOT" not in set(long["weather_zone"])


def test_zone_peaks_split_summer_and_winter() -> None:
    long = pd.DataFrame({
        "weather_zone": ["COAST"] * 3,
        "hour_start_utc": pd.to_datetime(["2024-07-15 20:00", "2024-01-16 12:00", "2024-04-01 20:00"], utc=True),
        "load_mw": [25000.0, 21000.0, 30000.0],
    })
    peaks = zone_peaks(long).set_index(["weather_zone", "year"])
    assert peaks.at[("COAST", 2024), "summer_peak_mw"] == 25000.0
    assert peaks.at[("COAST", 2024), "winter_peak_mw"] == 21000.0


def test_fallback_peak_uses_the_utilitys_share_of_zone_customers() -> None:
    grid = pd.DataFrame({"utility_id": [1, 2], "summer_peak_mw": [None, 900.0], "winter_peak_mw": [None, 800.0],
                         "peak_source": [None, "eia861"]})
    crosswalk = pd.DataFrame({
        "county_fips": ["48201", "48201", "48039"],
        "utility_id": [1, 2, 1],
        "grid": ["ERCOT", "ERCOT", "ERCOT"],
        "customers_est": [600, 400, 1000],
    })
    zones = pd.DataFrame({"county_fips": ["48201", "48039"], "weather_zone": ["COAST", "COAST"]})
    peaks = pd.DataFrame({"weather_zone": ["COAST"], "year": [2024], "summer_peak_mw": [20000.0],
                          "winter_peak_mw": [15000.0]})
    out = fallback_peaks(grid, crosswalk, zones, peaks, year=2024).set_index("utility_id")
    assert out.at[1, "summer_peak_mw"] == pytest.approx(20000 * 1600 / 2000)
    assert out.at[1, "winter_peak_mw"] == pytest.approx(15000 * 1600 / 2000)
    assert out.at[1, "peak_source"] == "ercot_zone_estimate"
    assert out.at[2, "summer_peak_mw"] == 900.0
    assert out.at[2, "peak_source"] == "eia861"


def test_hour_cells_stored_as_excel_dates_are_read_as_hour_ending() -> None:
    import datetime as dt

    frame = _day("11/30/2022", ["24:00"])
    frame = pd.concat([frame, _day("12/01/2022", ["02:00"])], ignore_index=True)
    frame.loc[len(frame)] = {"Hour Ending": dt.datetime(2022, 12, 1, 1, 0), **{z: 1.0 for z in ZONES}, "ERCOT": 8.0}
    long = parse_native_load(frame)
    hours = sorted(long.loc[long["weather_zone"] == "COAST", "hour_start_utc"])
    assert hours == list(pd.to_datetime(["2022-12-01 05:00", "2022-12-01 06:00", "2022-12-01 07:00"], utc=True))
