"""ERCOT real-time settlement point prices by load zone and hub (report NP6-785-ER).

Run: python -m pipeline.sources.ercot_prices   (needs the `data` extra)
One parquet per year under data/raw/ercot_prices, keyed on UTC so the
fall-back hour keeps both of its intervals.

The annual workbook lists every load zone twice: LZ and the energy-weighted LZEW.
gridstatus reads that flag only from a column named SettlementPointType, and the
annual file spells it "Settlement Point Type", so both rows come back as "Load Zone".
We rename the column before gridstatus parses it and keep LZ and hubs only.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

from pipeline import settings

KEEP_TYPES = {"Load Zone": "load_zone", "Trading Hub": "hub"}


def year_path(year: int, directory: Path = settings.RAW_PRICES_DIR) -> Path:
    return directory / f"rtm_spp_lz_hub_{year}.parquet"


def zone_and_hub_prices(raw: pd.DataFrame) -> pd.DataFrame:
    """Load-zone and hub rows from a gridstatus SPP frame, in UTC, one row per interval and location."""
    kept = raw.loc[raw["Location Type"].astype(str).isin(KEEP_TYPES)]
    out = pd.DataFrame({
        "interval_start_utc": pd.to_datetime(kept["Interval Start"]).dt.tz_convert("UTC"),
        "location": kept["Location"].astype(str),
        "location_type": kept["Location Type"].astype(str).map(KEEP_TYPES),
        "spp": kept["SPP"].astype(float),
    })
    duplicated = out.duplicated(["interval_start_utc", "location"])
    if duplicated.any():
        raise ValueError(f"{int(duplicated.sum())} repeated interval-location rows; check settlement point types")
    return out.sort_values(["location", "interval_start_utc"]).reset_index(drop=True)


def load_zone_prices(raw: pd.DataFrame) -> pd.DataFrame:
    """interval_start_utc, load_zone, spp for load zones only."""
    prices = zone_and_hub_prices(raw)
    zones = prices.loc[prices["location_type"] == "load_zone"]
    return zones.rename(columns={"location": "load_zone"})[["interval_start_utc", "load_zone", "spp"]].reset_index(drop=True)


def _annual_frame(year: int) -> pd.DataFrame:
    import gridstatus
    from gridstatus import utils
    from gridstatus.base import Markets
    from gridstatus.ercot import HISTORICAL_RTM_LOAD_ZONE_AND_HUB_PRICES_RTID

    ercot = gridstatus.Ercot()
    doc = ercot._get_document(
        report_type_id=HISTORICAL_RTM_LOAD_ZONE_AND_HUB_PRICES_RTID,
        constructed_name_contains=f"{year}.zip",
    )
    raw = pd.concat(pd.read_excel(utils.get_zip_file(doc.url), sheet_name=None).values())
    raw = raw.dropna(subset=["Delivery Hour", "Delivery Interval"], how="all")
    raw = raw.rename(columns={"Settlement Point Type": "SettlementPointType"})
    raw["Delivery Interval"] = raw["Delivery Interval"].astype("Int64")
    return ercot._finalize_spp_df(ercot.parse_doc(raw), market=Markets.REAL_TIME_15_MIN)


def fetch_year(year: int, directory: Path = settings.RAW_PRICES_DIR) -> Path:
    path = year_path(year, directory)
    if path.exists():
        return path
    prices = zone_and_hub_prices(_annual_frame(year))
    directory.mkdir(parents=True, exist_ok=True)
    prices.to_parquet(path, index=False)
    return path


def read_prices(years=settings.PRICE_YEARS, directory: Path = settings.RAW_PRICES_DIR) -> pd.DataFrame:
    """Load-zone prices for `years` as interval_start_utc, load_zone, spp."""
    frames = [pd.read_parquet(year_path(year, directory)) for year in years]
    prices = pd.concat(frames, ignore_index=True)
    zones = prices.loc[prices["location_type"] == "load_zone"]
    return zones.rename(columns={"location": "load_zone"})[["interval_start_utc", "load_zone", "spp"]].reset_index(drop=True)


def main() -> int:
    for year in settings.PRICE_YEARS:
        path = fetch_year(year)
        prices = pd.read_parquet(path)
        counts = prices["location_type"].value_counts()
        print(f"{year}: {counts.get('load_zone', 0):,} load-zone and {counts.get('hub', 0):,} hub rows in {path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
