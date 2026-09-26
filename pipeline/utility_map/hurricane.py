"""Hurricane layer from NHC HURDAT2 best tracks (UM-4.3).

Source: https://www.nhc.noaa.gov/data/hurdat/ (Atlantic basin, hurdat2-1851-2025-091226.txt).
Six-hourly fixes are interpolated to hourly points. A county is hit by a storm when any
point with tropical-storm-force winds (34 kt or more) passes within 100 km of the
county's interior point; the hit counts the storm's strongest wind there ÷ 64 kt, so a
hurricane-force pass is 1 and a Category 4 pass is about 2.

  hurricane index = Σ over storms (max wind within 100 km ÷ 64) per decade, 1980-2025

Run: python -m pipeline.utility_map.hurricane
"""
from __future__ import annotations

import json
import re
import sys

import numpy as np
import pandas as pd

from pipeline import settings
from pipeline.utility_map.manifest import record

URL = "https://www.nhc.noaa.gov/data/hurdat/hurdat2-1851-2025-091226.txt"
RAW = settings.RAW_DIR / "nhc" / "hurdat2-1851-2025-091226.txt"
YEARS = range(1980, 2026)
TS_KT, HIT_KM = 34.0, 100.0
REGION = (-108.0, 24.0, -92.0, 37.5)  # lon/lat box around Texas for the map tracks
COUNTIES = settings.REPO_ROOT / "public" / "utility-map" / "data" / "utility-map.json"


def parse_hurdat(text: str) -> pd.DataFrame:
    rows, storm, name = [], None, None
    for line in text.splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 8:
            if len(parts) >= 3 and parts[0][:2].isalpha():
                storm, name = parts[0], parts[1]
            continue
        # Positions are read by pattern: a few lines in the archive lack the comma between them.
        position = re.search(r"([\d.]+)([NS])\s*,?\s*([\d.]+)([EW])\s*,\s*(-?\d+)", line)
        if position is None:
            continue
        lat = float(position.group(1)) * (1 if position.group(2) == "N" else -1)
        lon = float(position.group(3)) * (-1 if position.group(4) == "W" else 1)
        time = pd.Timestamp(f"{parts[0]} {parts[1][:2]}:{parts[1][2:]}", tz="UTC")
        rows.append((storm, name, time, parts[3], lat, lon, float(position.group(5))))
    return pd.DataFrame(rows, columns=["storm_id", "name", "time_utc", "status", "lat", "lon", "wind_kt"])


def hourly(fixes: pd.DataFrame) -> pd.DataFrame:
    frame = fixes.drop_duplicates("time_utc").set_index("time_utc")[["lat", "lon", "wind_kt"]]
    frame = frame.resample("1h").asfreq().interpolate(method="time")
    return frame.reset_index()


def category(wind_kt: float) -> int:
    """Saffir-Simpson category; 0 = tropical storm or weaker."""
    return int(sum(wind_kt >= cut for cut in (64, 83, 96, 113, 137)))


def _km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    a = np.sin((lat2 - lat1) / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin((lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * np.arcsin(np.sqrt(a))


def county_hurricane_index(points: pd.DataFrame, centers: pd.DataFrame, decades: float) -> pd.Series:
    strong = points.loc[points["wind_kt"] >= TS_KT]
    total = pd.Series(0.0, index=centers["county_fips"].to_numpy())
    for _, storm in strong.groupby("storm_id"):
        dist = _km(centers["lat"].to_numpy()[:, None], centers["lon"].to_numpy()[:, None],
                   storm["lat"].to_numpy()[None, :], storm["lon"].to_numpy()[None, :])
        near = np.where(dist <= HIT_KM, storm["wind_kt"].to_numpy()[None, :], 0.0).max(axis=1)
        total += near / 64.0
    return (total / decades).rename("hurricane")


def _track_features(fixes: pd.DataFrame) -> list[dict]:
    features = []
    for (storm_id, name), storm in fixes.groupby(["storm_id", "name"], sort=False):
        storm = storm.reset_index(drop=True)
        for a, b in zip(storm.index[:-1], storm.index[1:]):
            p, q = storm.loc[a], storm.loc[b]
            lon0, lat0, lon1, lat1 = REGION
            if not any(lon0 <= r.lon <= lon1 and lat0 <= r.lat <= lat1 for r in (p, q)) or p.wind_kt < TS_KT:
                continue
            features.append({
                "type": "Feature",
                "properties": {"name": name.title(), "year": int(p.time_utc.year), "wind_kt": int(p.wind_kt),
                               "category": category(p.wind_kt), "storm_id": storm_id},
                "geometry": {"type": "LineString",
                             "coordinates": [[round(p.lon, 2), round(p.lat, 2)], [round(q.lon, 2), round(q.lat, 2)]]},
            })
    return features


def main() -> int:
    fixes = parse_hurdat(RAW.read_text())
    fixes = fixes.loc[fixes["time_utc"].dt.year.between(min(YEARS), max(YEARS))]
    points = pd.concat(
        [hourly(storm).assign(storm_id=sid) for sid, storm in fixes.groupby("storm_id")], ignore_index=True)
    contract = json.loads(COUNTIES.read_text())
    centers = pd.DataFrame({
        "county_fips": [c["fips"] for c in contract["counties"]],
        "lon": [c["centroid"][0] for c in contract["counties"]],
        "lat": [c["centroid"][1] for c in contract["counties"]],
    })
    index = county_hurricane_index(points, centers, decades=len(YEARS) / 10)
    index.round(4).rename_axis("county_fips").reset_index().to_parquet(
        settings.UTILITY_MAP_DIR / "county_hurricane.parquet", index=False)

    out = settings.UTILITY_MAP_DIR / "hazards" / "hurricane_tracks.geojson"
    out.parent.mkdir(parents=True, exist_ok=True)
    features = _track_features(fixes)
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))
    record("nhc_hurdat2", URL, RAW, rows=len(fixes), period_start=f"{min(YEARS)}-01-01",
           period_end=f"{max(YEARS)}-12-31", note="Atlantic best tracks; hourly interpolation; 34 kt within 100 km.")
    names = {c["fips"]: c["name"] for c in contract["counties"]}
    top = index.sort_values(ascending=False).head(8)
    print(f"{len(features)} track segments near Texas; {(index > 0).sum()} counties ever hit")
    print("\n".join(f"  {names[f]:<12} {v:.2f}" for f, v in top.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
