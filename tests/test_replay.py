import zipfile
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from openpyxl import Workbook

from api.app.sim.backup import KWH_PER_CORE, STEP_H
from pipeline.events import customer_durations, event_curve, extract_events, weighted_quantile
from pipeline.simulate import ProfileYears, event_local_date, replay_coverage

_MONTH_SHEETS = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "SEP", "OCT", "NOV", "DEC"]


def _year_zip(directory: Path, year: int, days: dict[date, float]) -> None:
    book = Workbook()
    book.remove(book.active)
    sheets = {}
    for month, name in enumerate(_MONTH_SHEETS, start=1):
        sheets[month] = book.create_sheet(name)
        sheets[month].append(["PType_WZ", "Date", "int_kWh1", "int_kWh2", "ADDTIME"])
    for day, value in days.items():
        if day.year == year:
            sheets[day.month].append(["RESLOWR_COAST", day, value, value, None])
    workbook = directory / f"profiles_{year}.xlsx"
    book.save(workbook)
    book.close()
    with zipfile.ZipFile(directory / f"profiles_{year}.zip", "w") as archive:
        archive.write(workbook, arcname=workbook.name)
    workbook.unlink()


def test_profile_week_crosses_new_year(tmp_path: Path):
    days = {
        date(2021, 12, 31): 1.0,
        date(2022, 1, 1): 2.0,
    }
    _year_zip(tmp_path, 2021, days)
    _year_zip(tmp_path, 2022, days)
    for cache in (None, tmp_path / "cache"):
        profiles = ProfileYears("RESLOWR", "COAST", tmp_path, cache_dir=cache)
        assert profiles.span(date(2021, 12, 31), 2).tolist() == [1.0, 1.0, 2.0, 2.0]
        assert profiles.annual_kwh(2021) == pytest.approx(2.0)
    assert (tmp_path / "cache" / "profiles_2022.parquet").exists()
    reread = ProfileYears("RESLOWR", "COAST", tmp_path / "no-zips", cache_dir=tmp_path / "cache")
    assert reread.span(date(2022, 1, 1), 1).tolist() == [2.0, 2.0]


def test_event_local_date_is_central_time():
    assert event_local_date(pd.Timestamp("2021-02-15 05:15", tz="UTC")) == date(2021, 2, 14)


def test_event_curve_matches_extracted_event():
    idx = pd.date_range("2024-07-08", periods=40, freq="15min", tz="UTC")
    series = pd.Series(0.0, index=idx)
    series.iloc[2:10] = 5_000
    series.iloc[12:20] = 4_000
    events = extract_events(series, customers_total=100_000)
    curve = event_curve(series, events[0]["start"], events[0]["end"])
    assert curve.max() == events[0]["peak_out"]
    durations, weights = customer_durations(curve, order="stay")
    assert weighted_quantile(durations, weights, 0.9) == pytest.approx(events[0]["p90_h_stay"])


def test_long_backup_covers_a_ten_hour_outage():
    curve = np.full(40, 1_000.0)
    week = np.full(96 * 5, (KWH_PER_CORE / 36.0) * STEP_H)
    result = replay_coverage(curve, week, profile_annual_kwh=1.0, home_annual_kwh=1.0)
    assert result["hours"][1] == pytest.approx(36.0)
    assert result["covered"]["rotate"][1]["homes"] == pytest.approx(1.0)
    assert result["covered"]["stay"][1]["hours"] == pytest.approx(1.0)


def test_nine_hour_backup_covers_part_of_a_ten_hour_outage():
    curve = np.full(40, 1_000.0)
    week = np.full(96 * 5, 4.0 * (KWH_PER_CORE / 36.0) * STEP_H)
    result = replay_coverage(curve, week, profile_annual_kwh=1.0, home_annual_kwh=1.0)
    assert result["hours"][1] == pytest.approx(9.0)
    covered = result["covered"]["rotate"][1]
    assert covered["homes"] == pytest.approx(0.0)
    assert covered["hours"] == pytest.approx(0.9)
