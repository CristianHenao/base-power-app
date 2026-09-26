"""ERCOT real-time settlement point prices by load zone (report NP6-785-ER).

Run: python -m pipeline.sources.ercot_prices   (needs the `data` extra)
One parquet per year under data/raw/ercot_prices, keyed on UTC so the
fall-back hour keeps both of its intervals.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

from pipeline import settings

PRICE_COLUMNS = ("interval_start_utc", "load_zone", "spp")


def year_path(year: int, directory: Path = settings.RAW_PRICES_DIR) -> Path:
    return directory / f"rtm_spp_{year}.parquet"


def load_zone_prices(raw: pd.DataFrame) -> pd.DataFrame:
    """Load-zone rows from a gridstatus RTM SPP frame, in UTC."""
    zones = raw.loc[raw["Location Type"].astype(str) == "Load Zone"]
    out = pd.DataFrame({
        "interval_start_utc": pd.to_datetime(zones["Interval Start"]).dt.tz_convert("UTC"),
        "load_zone": zones["Location"].astype(str),
        "spp": zones["SPP"].astype(float),
    })
    return out.sort_values(["load_zone", "interval_start_utc"]).reset_index(drop=True)


def fetch_year(year: int, directory: Path = settings.RAW_PRICES_DIR) -> Path:
    path = year_path(year, directory)
    if path.exists():
        return path
    import gridstatus

    prices = load_zone_prices(gridstatus.Ercot().get_rtm_spp(year))
    directory.mkdir(parents=True, exist_ok=True)
    prices.to_parquet(path, index=False)
    return path


def read_prices(years=settings.PRICE_YEARS, directory: Path = settings.RAW_PRICES_DIR) -> pd.DataFrame:
    frames = [pd.read_parquet(year_path(year, directory)) for year in years]
    return pd.concat(frames, ignore_index=True)


def main() -> int:
    for year in settings.PRICE_YEARS:
        path = fetch_year(year)
        rows = len(pd.read_parquet(path))
        print(f"{year}: {rows:,} load-zone rows in {path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
