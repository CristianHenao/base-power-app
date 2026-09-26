"""Hail and wind layer from the NOAA SPC Severe Weather Database (UM-4.2).

Sources: https://www.spc.noaa.gov/wcm/#data, 1955-2025_hail.csv.zip and 1955-2025_wind.csv.zip.
Hail of 1 inch or more (today's severe threshold; the file goes down to 0.75") and every
wind report (the file lists only severe winds, 50 kt+ or damaging; magnitude 0 means the
speed wasn't measured). County from the state and county FIPS on each report.

  severe_storm index = reports per thousand km² of land per year (2000-2025)

Run: python -m pipeline.utility_map.severe_storms
"""
from __future__ import annotations

import json
import sys

import pandas as pd

from pipeline import settings
from pipeline.utility_map.geography import county_land_km2
from pipeline.utility_map.manifest import record

URL = "https://www.spc.noaa.gov/wcm/"
HAIL = settings.RAW_DIR / "spc" / "1955-2025_hail.csv.zip"
WIND = settings.RAW_DIR / "spc" / "1955-2025_wind.csv.zip"
YEARS = range(2000, 2026)
HAIL_MIN_IN = 1.0


def severe_reports(hail: pd.DataFrame, wind: pd.DataFrame, years=YEARS) -> pd.DataFrame:
    def texas(frame: pd.DataFrame) -> pd.DataFrame:
        return frame.loc[(frame["st"] == "TX") & frame["yr"].between(min(years), max(years))]

    hail = texas(hail)
    hail = hail.loc[hail["mag"] >= HAIL_MIN_IN].assign(kind="hail")
    wind = texas(wind).assign(kind="wind")
    both = pd.concat([hail, wind], ignore_index=True)
    both["county_fips"] = both["stf"].astype(int).astype(str).str.zfill(2) + both["f1"].astype(int).astype(str).str.zfill(3)
    return both[["county_fips", "kind", "mag", "yr", "slat", "slon"]]


def county_reports_index(reports: pd.DataFrame, land_km2: pd.Series, years: int) -> pd.Series:
    counts = reports.groupby("county_fips").size().reindex(land_km2.index, fill_value=0)
    return (counts / (land_km2 / 1000) / years).rename("severe_storm")


def _size(kind: str, mag: float) -> int:
    """1-3: hail 1-1.74", 1.75-2.74", 2.75"+ (golf ball, baseball); wind unknown-57, 58-74, 75+ mph."""
    if kind == "hail":
        return 1 if mag < 1.75 else 2 if mag < 2.75 else 3
    mph = mag * 1.15078
    return 1 if mph < 58 else 2 if mph < 75 else 3


def points_geojson(reports: pd.DataFrame) -> dict:
    """One MultiPoint per kind and size class: small enough to ship with the release."""
    sizes = [_size(k, m) for k, m in zip(reports["kind"], reports["mag"])]
    frame = reports.assign(size=sizes)
    features = [
        {"type": "Feature", "properties": {"kind": kind, "size": int(size)},
         "geometry": {"type": "MultiPoint",
                      "coordinates": [[round(float(x), 3), round(float(y), 3)] for x, y in zip(part["slon"], part["slat"])]}}
        for (kind, size), part in frame.groupby(["kind", "size"])
    ]
    return {"type": "FeatureCollection", "features": features}


def main() -> int:
    reports = severe_reports(pd.read_csv(HAIL, low_memory=False), pd.read_csv(WIND, low_memory=False))
    area = county_land_km2()
    index = county_reports_index(reports, area, len(YEARS))
    index.round(4).rename_axis("county_fips").reset_index().to_parquet(
        settings.UTILITY_MAP_DIR / "county_severe_storm.parquet", index=False)
    out = settings.UTILITY_MAP_DIR / "hazards" / "severe_reports.geojson"
    out.write_text(json.dumps(points_geojson(reports), separators=(",", ":")))
    record("spc_hail_wind", URL, HAIL, WIND, rows=len(reports), period_start=f"{min(YEARS)}-01-01",
           period_end=f"{max(YEARS)}-12-31", note="Texas hail >= 1 inch and all severe wind reports.")
    print(f"{len(reports):,} reports ({(reports['kind'] == 'hail').sum():,} hail); points file {out.stat().st_size / 1e6:.2f} MB")
    print(index.sort_values(ascending=False).head(6).round(3).to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main())
