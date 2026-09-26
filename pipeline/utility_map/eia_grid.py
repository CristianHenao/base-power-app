"""Utility sales and peak demand from EIA-861 (UM-1.1).

Operational_Data gives each utility's summer and winter peak demand (MW). Sales_Ult_Cust
gives bundled utilities' sales (residential first, total last); Delivery_Companies gives
the wires companies' delivered energy. Retail providers' energy-only rows are left out so
homes and energy are not counted twice. Wires companies such as CenterPoint report no
peak; pipeline.utility_map.ercot_load estimates those from ERCOT zone load.

Run: python -m pipeline.utility_map.eia_grid
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

from pipeline import settings
from pipeline.utility_map.manifest import record

YEAR = 2024
URL = "https://www.eia.gov/electricity/data/eia861/"
OUT = settings.UTILITY_MAP_DIR / "utility_grid.parquet"


def _read(path: Path, sheet: str | int = 0) -> pd.DataFrame:
    frame = pd.read_excel(path, sheet_name=sheet, header=2)
    frame.columns = [str(column).split("\n")[0].strip() for column in frame.columns]
    return frame.loc[frame["State"] == "TX"].copy()


def _number(series: pd.Series) -> pd.Series:
    """EIA writes blanks as "."; zero peak means not reported."""
    values = pd.to_numeric(series, errors="coerce")
    return values.where(values > 0)


def _sales(frame: pd.DataFrame) -> pd.DataFrame:
    total_mwh = [c for c in frame.columns if c.startswith("Megawatthours")][-1]
    return pd.DataFrame({
        "utility_id": frame["Utility Number"].astype(int),
        "residential_mwh": _number(frame["Megawatthours"]),
        "residential_customers": _number(frame["Count"]),
        "sales_mwh": _number(frame[total_mwh]),
    })


def utility_grid(raw_dir: Path, year: int = YEAR) -> pd.DataFrame:
    ops = _read(raw_dir / f"Operational_Data_{year}.xlsx", "States")
    peaks = pd.DataFrame({
        "utility_id": ops["Utility Number"].astype(int),
        "summer_peak_mw": _number(ops["Summer Peak Demand"]),
        "winter_peak_mw": _number(ops["Winter Peak Demand"]),
    })
    bundled = _read(raw_dir / f"Sales_Ult_Cust_{year}.xlsx", "States")
    bundled = bundled.loc[bundled["Service Type"] == "Bundled"]
    delivery = _read(raw_dir / f"Delivery_Companies_{year}.xlsx")
    sales = pd.concat([_sales(bundled), _sales(delivery)]).groupby("utility_id", as_index=False).sum(min_count=1)

    grid = peaks.groupby("utility_id", as_index=False).max().merge(sales, on="utility_id", how="outer")
    grid["peak_source"] = grid["summer_peak_mw"].notna().map({True: "eia861", False: None})
    return grid.sort_values("utility_id").reset_index(drop=True)


def main() -> int:
    raw_dir = settings.RAW_DIR / "eia861"
    grid = utility_grid(raw_dir)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    grid.to_parquet(OUT, index=False)
    files = [raw_dir / f"{name}_{YEAR}.xlsx" for name in ("Operational_Data", "Sales_Ult_Cust", "Delivery_Companies")]
    record("eia861_grid", URL, *files, rows=len(grid), period_start=f"{YEAR}-01-01", period_end=f"{YEAR}-12-31",
           note="Summer/winter peak demand, bundled sales and delivery-company energy by utility.")
    print(f"wrote {OUT} ({len(grid)} utilities; {grid['summer_peak_mw'].notna().sum()} with a peak)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
