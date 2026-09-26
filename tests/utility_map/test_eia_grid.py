from pathlib import Path

import pandas as pd
import pytest

from pipeline.utility_map.eia_grid import utility_grid


def _sheet(path: Path, sheet: str, rows: list[dict]) -> None:
    """EIA workbooks have two title rows above the header."""
    frame = pd.DataFrame(rows)
    with pd.ExcelWriter(path, mode="a" if path.exists() else "w") as writer:
        frame.to_excel(writer, sheet_name=sheet, startrow=2, index=False)


def _sales_row(uid: int, service: str, res_mwh, res_count, total_mwh, total_count, state: str = "TX") -> dict:
    return {
        "Data Year": 2024, "Utility Number": uid, "Utility Name": f"u{uid}", "Part": "A",
        "Service Type": service, "State": state, "Megawatthours": res_mwh, "Count": res_count,
        "Megawatthours.1": 0, "Count.1": 0, "Megawatthours.2": 0, "Count.2": 0,
        "Megawatthours.3": 0, "Count.3": 0, "Megawatthours.4": total_mwh, "Count.4": total_count,
    }


@pytest.fixture()
def raw(tmp_path: Path) -> Path:
    _sheet(tmp_path / "Operational_Data_2024.xlsx", "States", [
        {"Data Year": 2024, "Utility Number": 1, "Utility Name": "City", "State": "TX",
         "Summer Peak Demand": 3110, "Winter Peak Demand": 2693},
        {"Data Year": 2024, "Utility Number": 2, "Utility Name": "Wires", "State": "TX",
         "Summer Peak Demand": ".", "Winter Peak Demand": "."},
        {"Data Year": 2024, "Utility Number": 1, "Utility Name": "City", "State": "OK",
         "Summer Peak Demand": 99, "Winter Peak Demand": 99},
    ])
    _sheet(tmp_path / "Sales_Ult_Cust_2024.xlsx", "States", [
        _sales_row(1, "Bundled", 5_000_000, 500_000, 14_000_000, 560_000),
        _sales_row(9, "Energy", 800, 80, 900, 90),
    ])
    _sheet(tmp_path / "Delivery_Companies_2024.xlsx", "Delivery", [
        _sales_row(2, "Delivery", 46_000_000, 3_400_000, 162_000_000, 4_000_000),
    ])
    return tmp_path


def test_peaks_come_from_operational_data_and_blanks_stay_null(raw: Path) -> None:
    grid = utility_grid(raw).set_index("utility_id")
    assert grid.at[1, "summer_peak_mw"] == 3110
    assert grid.at[1, "winter_peak_mw"] == 2693
    assert grid.at[1, "peak_source"] == "eia861"
    assert pd.isna(grid.at[2, "summer_peak_mw"])
    assert pd.isna(grid.at[2, "peak_source"])


def test_sales_use_bundled_rows_and_delivery_companies_only(raw: Path) -> None:
    grid = utility_grid(raw).set_index("utility_id")
    assert grid.at[1, "residential_mwh"] == 5_000_000
    assert grid.at[1, "sales_mwh"] == 14_000_000
    assert grid.at[1, "residential_customers"] == 500_000
    assert grid.at[2, "sales_mwh"] == 162_000_000
    assert 9 not in grid.index  # retail energy-only rows would double count


def test_only_texas_rows(raw: Path) -> None:
    grid = utility_grid(raw)
    assert sorted(grid["utility_id"]) == [1, 2]
