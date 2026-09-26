"""Tornado layer from the NOAA SPC Severe Weather Database (UM-4.1).

Source: https://www.spc.noaa.gov/wcm/#data, 1950-2025_actual_tornadoes.csv. One row per
track; tracks crossing states also have one row per state segment (sg = 2), which we use
for Texas so each track is counted once. Each track is split between the counties it
crosses by the distance it runs in each (straight line start to end, the SPC geometry).

  tornado index = Σ path km in the county × (EF + 1) ÷ thousand km² of land ÷ years
EF unknown (-9) counts as EF0.

Run: python -m pipeline.utility_map.tornado  (after storm_events for county areas)
"""
from __future__ import annotations

import json
import sys

import pandas as pd
from shapely.geometry import LineString, Point, mapping, shape
from shapely.strtree import STRtree

from pipeline import settings
from pipeline.utility_map.geography import county_land_km2
from pipeline.utility_map.manifest import record

URL = "https://www.spc.noaa.gov/wcm/data/1950-2025_actual_tornadoes.csv"
RAW = settings.RAW_DIR / "spc" / "1950-2025_actual_tornadoes.csv"
YEARS = range(2000, 2026)
MILE_KM = 1.609344
COUNTIES = settings.REPO_ROOT / "public" / "utility-map" / "data" / "counties.geojson"


def texas_tracks(frame: pd.DataFrame, years=YEARS) -> pd.DataFrame:
    """Texas tracks plus border-crossing tracks; each track once.

    The current actual_tornadoes file carries whole tracks only (sg = 1). If Texas state
    segments (sg = 2) are present they replace their whole track. Distance outside Texas
    is dropped later when tracks are clipped to Texas counties.
    """
    frame = frame.loc[frame["yr"].between(min(years), max(years))]
    segments = frame.loc[(frame["sg"] == 2) & (frame["st"] == "TX")]
    whole = frame.loc[frame["sg"].isin([1, -9]) & ((frame["st"] == "TX") | (frame["ns"] > 1))]
    whole = whole.loc[~whole.set_index(["om", "yr"]).index.isin(segments.set_index(["om", "yr"]).index)]
    return pd.concat([whole, segments]).sort_values(["yr", "om"], kind="stable").reset_index(drop=True)


def _geometry(row) -> Point | LineString:
    end_missing = row.elat == 0 or row.elon == 0 or (row.elat == row.slat and row.elon == row.slon)
    if end_missing:
        return Point(row.slon, row.slat)
    return LineString([(row.slon, row.slat), (row.elon, row.elat)])


def track_lengths(tracks: pd.DataFrame, counties: dict) -> pd.DataFrame:
    fips = list(counties)
    tree = STRtree([counties[f] for f in fips])
    rows = []
    for row in tracks.itertuples(index=False):
        geom = _geometry(row)
        total_km = float(row.len) * MILE_KM
        for i in tree.query(geom):
            county = counties[fips[i]]
            if isinstance(geom, Point):
                if county.contains(geom):
                    rows.append((row.om, fips[i], total_km, row.mag, row.yr))
                continue
            share = geom.intersection(county).length / geom.length
            if share > 0:
                rows.append((row.om, fips[i], total_km * share, row.mag, row.yr))
    return pd.DataFrame(rows, columns=["om", "county_fips", "len_km", "mag", "yr"])


def county_tornado_index(lengths: pd.DataFrame, land_km2: pd.Series, years: int) -> pd.Series:
    weight = lengths["mag"].where(lengths["mag"] >= 0, 0) + 1
    weighted = (lengths["len_km"] * weight).groupby(lengths["county_fips"]).sum()
    return (weighted.reindex(land_km2.index, fill_value=0.0) / (land_km2 / 1000) / years).rename("tornado")


def _counties() -> dict:
    return {f["properties"]["fips"]: shape(f["geometry"]) for f in json.loads(COUNTIES.read_text())["features"]}


def main() -> int:
    tracks = texas_tracks(pd.read_csv(RAW, low_memory=False))
    counties = _counties()
    lengths = track_lengths(tracks, counties)
    area = county_land_km2().reindex(sorted(counties))
    index = county_tornado_index(lengths, area, len(YEARS))
    index.round(4).rename_axis("county_fips").reset_index().to_parquet(
        settings.UTILITY_MAP_DIR / "county_tornado.parquet", index=False)

    in_texas = tracks.set_index(["om", "yr"]).index.isin(lengths.set_index(["om", "yr"]).index)
    tracks = tracks.loc[in_texas]
    features = [
        {"type": "Feature",
         "properties": {"ef": int(r.mag), "year": int(r.yr), "date": str(r.date), "len_km": round(float(r.len) * MILE_KM, 1),
                        "inj": int(r.inj), "fat": int(r.fat)},
         "geometry": json.loads(json.dumps(mapping(_geometry(r))))}
        for r in tracks.itertuples(index=False)
    ]
    out = settings.UTILITY_MAP_DIR / "hazards" / "tornado_tracks.geojson"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"type": "FeatureCollection", "features": features}, separators=(",", ":")))
    record("spc_tornadoes", URL, RAW, rows=len(tracks), period_start=f"{min(YEARS)}-01-01",
           period_end=f"{max(YEARS)}-12-31", note="Texas tracks and Texas segments of multi-state tracks.")
    print(f"{len(tracks)} Texas tracks; tracks file {out.stat().st_size / 1e6:.2f} MB")
    print(index.sort_values(ascending=False).head(8).round(3).to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main())
