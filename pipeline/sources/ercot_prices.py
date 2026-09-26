"""ERCOT historical real-time settlement point prices for load zones and hubs (NP6-785-ER).

One workbook per year, one sheet per month. ERCOT stamps each 15-minute interval
with a Central Prevailing Time date, hour ending (1-24) and interval (1-4). On the
fall-back day hour 2 appears twice; the second copy has Repeated Hour Flag = Y.
We convert to the UTC start of each interval so the duplicate hour stays distinct.

Run: python -m pipeline.sources.ercot_prices [--download]
"""
from __future__ import annotations

import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

from pipeline import settings

RAW_DIR = settings.RAW_ERCOT_DIR / "rtm_spp"
OUT_PARQUET = settings.REPO_ROOT / "data" / "processed" / "ercot_rtm_spp.parquet"
LOCAL_TZ = "America/Chicago"

OUT_COLUMNS = ("interval_start_utc", "settlement_point", "point_type", "price")

DOC_LIST_URL = "https://www.ercot.com/misapp/servlets/IceDocListJsonWS?reportTypeId=13061"
DOC_URL = "https://www.ercot.com/misdownload/servlets/mirDownload?doclookupId={}"
FIRST_YEAR = int(settings.RATES_START[:4])


def _get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "porchlight-pipeline"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def download(raw_dir: Path = RAW_DIR, first_year: int = FIRST_YEAR) -> None:
    """Fetch and unzip every yearly workbook from `first_year`. The current year is always refreshed."""
    raw_dir.mkdir(parents=True, exist_ok=True)
    docs = json.loads(_get(DOC_LIST_URL))["ListDocsByRptTypeRes"]["DocumentList"]
    for entry in docs:
        doc = entry["Document"]
        year = int(doc["FriendlyName"][-4:])
        existing = list(raw_dir.glob(f"*RTMLZHBSPP_{year}.xlsx"))
        if year < first_year or (existing and year < pd.Timestamp.now().year):
            continue
        zipfile.ZipFile(io.BytesIO(_get(DOC_URL.format(doc["DocID"])))).extractall(raw_dir)
        print(f"downloaded {doc['FriendlyName']}")


def to_utc(frame: pd.DataFrame) -> pd.Series:
    """UTC start of each interval from ERCOT's date, hour ending, interval and repeat flag."""
    local = (
        pd.to_datetime(frame["Delivery Date"], format="%m/%d/%Y")
        + pd.to_timedelta(frame["Delivery Hour"].astype(int) - 1, unit="h")
        + pd.to_timedelta((frame["Delivery Interval"].astype(int) - 1) * 15, unit="min")
    )
    # In the repeated hour, the first copy is still daylight time and the flagged copy is standard.
    first_copy = frame["Repeated Hour Flag"].astype(str).str.strip().ne("Y").to_numpy()
    return local.dt.tz_localize(LOCAL_TZ, ambiguous=first_copy, nonexistent="raise").dt.tz_convert("UTC")


def tidy_month(frame: pd.DataFrame) -> pd.DataFrame:
    # Some sheets end with a footer row holding the publish timestamp and no price.
    frame = frame.dropna(subset=["Delivery Hour", "Settlement Point Name"])
    return pd.DataFrame(
        {
            "interval_start_utc": to_utc(frame),
            "settlement_point": frame["Settlement Point Name"].astype(str),
            "point_type": frame["Settlement Point Type"].astype(str),
            "price": pd.to_numeric(frame["Settlement Point Price"], errors="coerce"),
        }
    )


def read_year(path: Path) -> pd.DataFrame:
    sheets = pd.read_excel(path, sheet_name=None, dtype={"Delivery Date": str})
    return pd.concat([tidy_month(sheet) for sheet in sheets.values()], ignore_index=True)


def check(frame: pd.DataFrame) -> None:
    """One price per UTC interval, settlement point and type.

    Load zones appear twice per interval: LZ and LZEW (energy-weighted). Both are kept.
    """
    dupes = frame.duplicated(["interval_start_utc", "settlement_point", "point_type"]).sum()
    if dupes:
        raise ValueError(f"{dupes} duplicate (interval, point, type) rows after UTC conversion")


def main(argv: list[str]) -> int:
    if "--download" in argv:
        download()
    paths = sorted(RAW_DIR.glob("*RTMLZHBSPP_*.xlsx"))
    if not paths:
        print(f"no RTMLZHBSPP workbooks in {RAW_DIR}")
        return 1
    years = []
    for path in paths:
        year = read_year(path)
        print(f"{path.stem[-4:]}: {len(year):,} rows")
        years.append(year)
    frame = pd.concat(years, ignore_index=True).sort_values(["settlement_point", "interval_start_utc"])
    check(frame)
    OUT_PARQUET.parent.mkdir(parents=True, exist_ok=True)
    frame[list(OUT_COLUMNS)].to_parquet(OUT_PARQUET, index=False)
    print(f"wrote {len(frame):,} rows to {OUT_PARQUET}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
