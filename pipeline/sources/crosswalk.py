"""Texas county -> ERCOT weather zone.

ERCOT assigns weather zones by ZIP code (Load Profiling Guide Appendix D, sheet
ZipToZone). We join those ZIPs to counties with the Census 2020 ZCTA-to-county
relationship file and give each county the zone covering most of its land.
Counties with no ERCOT ZIPs (El Paso, the Panhandle, parts of East Texas sit
outside ERCOT) take the zone of the nearest assigned county and are flagged.

Run: python -m pipeline.sources.crosswalk
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import pandas as pd

from pipeline import settings

REFERENCE_DIR = settings.REPO_ROOT / "data" / "raw" / "reference"
ZIP_TO_ZONE_XLSX = REFERENCE_DIR / "ercot_profile_decision_tree_050124.xlsx"
ZCTA_COUNTY_TXT = REFERENCE_DIR / "zcta520_county20_natl.txt"
COUNTY_SHAPES = settings.REPO_ROOT / "data" / "raw" / "us-counties-20m.json"
OUT_CSV = settings.REPO_ROOT / "data" / "processed" / "county_weather_zone.csv"

OUT_COLUMNS = ("county_fips", "county", "weather_zone", "zone_share", "zone_source")


def read_zip_to_zone(path: Path) -> pd.DataFrame:
    """ZIP and weather zone code from ERCOT's Profile Decision Tree workbook."""
    frame = pd.read_excel(path, sheet_name="ZipToZone", header=4, dtype=str)
    return pd.DataFrame(
        {
            "zip": frame["Svc. Address ZIP Code"].str.strip().str.zfill(5),
            "weather_zone": frame["Weather Zone Code"].str.strip(),
        }
    ).dropna()


def read_zcta_county(path: Path, state_fips: str = "48") -> pd.DataFrame:
    """ZCTA, county and land area of their overlap, for one state."""
    frame = pd.read_csv(path, sep="|", dtype=str, encoding="utf-8-sig")
    frame = frame.dropna(subset=["GEOID_ZCTA5_20", "GEOID_COUNTY_20"])
    frame = frame.loc[frame["GEOID_COUNTY_20"].str.startswith(state_fips)]
    return pd.DataFrame(
        {
            "zip": frame["GEOID_ZCTA5_20"],
            "county_fips": frame["GEOID_COUNTY_20"],
            "county": frame["NAMELSAD_COUNTY_20"].str.replace(" County", "", regex=False),
            "land": pd.to_numeric(frame["AREALAND_PART"]),
        }
    )


def majority_zone(zip_zone: pd.DataFrame, zcta_county: pd.DataFrame) -> pd.DataFrame:
    """Zone covering the most land in each county, with that zone's share of the county."""
    joined = zcta_county.merge(zip_zone.drop_duplicates("zip"), on="zip", how="inner")
    land = joined.groupby(["county_fips", "weather_zone"], as_index=False)["land"].sum()
    land["zone_share"] = land["land"] / land.groupby("county_fips")["land"].transform("sum")
    best = land.sort_values(["county_fips", "zone_share"], ascending=[True, False])
    best = best.drop_duplicates("county_fips")[["county_fips", "weather_zone", "zone_share"]]
    best["zone_source"] = "ercot_zip"
    return best.reset_index(drop=True)


def county_centroids(path: Path, state_fips: str = "48") -> dict[str, tuple[float, float]]:
    """Rough centroid (mean of outer-ring vertices) per county. Good enough for nearest-zone."""
    features = json.loads(path.read_text())["features"]
    out: dict[str, tuple[float, float]] = {}
    for feature in features:
        fips = str(feature["id"]).zfill(5)
        if not fips.startswith(state_fips):
            continue
        geometry = feature["geometry"]
        polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        points = [point for polygon in polygons for point in polygon[0]]
        out[fips] = (
            sum(point[0] for point in points) / len(points),
            sum(point[1] for point in points) / len(points),
        )
    return out


def fill_nearest(
    assigned: pd.DataFrame,
    counties: pd.DataFrame,
    centroids: dict[str, tuple[float, float]],
) -> pd.DataFrame:
    """Every county in `counties`; unassigned ones take the nearest assigned county's zone."""
    table = counties.merge(assigned, on="county_fips", how="left")
    known = table.dropna(subset=["weather_zone"])
    for index, row in table.loc[table["weather_zone"].isna()].iterrows():
        lon, lat = centroids[row["county_fips"]]
        nearest = min(
            known.itertuples(),
            key=lambda other: math.dist((lon, lat), centroids[other.county_fips]),
        )
        table.loc[index, ["weather_zone", "zone_share", "zone_source"]] = [
            nearest.weather_zone,
            float("nan"),
            f"nearest:{nearest.county_fips}",
        ]
    return table[list(OUT_COLUMNS)].sort_values("county_fips").reset_index(drop=True)


def build(
    zip_xlsx: Path = ZIP_TO_ZONE_XLSX,
    zcta_txt: Path = ZCTA_COUNTY_TXT,
    shapes: Path = COUNTY_SHAPES,
) -> pd.DataFrame:
    zcta = read_zcta_county(zcta_txt)
    counties = zcta[["county_fips", "county"]].drop_duplicates()
    assigned = majority_zone(read_zip_to_zone(zip_xlsx), zcta)
    return fill_nearest(assigned, counties, county_centroids(shapes))


def main() -> int:
    table = build()
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    table.to_csv(OUT_CSV, index=False, float_format="%.3f")
    # pipeline/backtest.py reads the crosswalk from settings.COUNTY_WEATHER_ZONE_CSV.
    settings.COUNTY_WEATHER_ZONE_CSV.parent.mkdir(parents=True, exist_ok=True)
    table.to_csv(settings.COUNTY_WEATHER_ZONE_CSV, index=False, float_format="%.3f")
    print(table["weather_zone"].value_counts().to_string())
    print(f"{(table['zone_source'] != 'ercot_zip').sum()} counties filled from the nearest county")
    print(f"wrote {len(table)} counties to {OUT_CSV}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
