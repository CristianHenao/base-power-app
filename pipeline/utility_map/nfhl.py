"""FEMA flood zones for the demo counties (UM-3.3).

Source: FEMA National Flood Hazard Layer, "Flood Hazard Zones" (layer 28, S_FLD_HAZ_AR),
https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28. Effective maps;
unmapped areas have no polygons. Zones are grouped into three classes for the map:

  floodway  regulatory floodway inside the 1% zone (ZONE_SUBTY "FLOODWAY")
  1pct      1% annual chance, the Special Flood Hazard Area (SFHA_TF "T": A, AE, AH, AO, VE)
  0.2pct    0.2% annual chance (shaded X)

Each county's classes are clipped to the county, dissolved, and simplified until the file
is under the size cap. sfha_pct = share of county area in the 1% zone (floodway included).

Run: python -m pipeline.utility_map.nfhl fetch   (pages to RAW_DIR/nfhl/<fips>/)
     python -m pipeline.utility_map.nfhl
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import pandas as pd
import shapely
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

from pipeline import settings
from pipeline.utility_map.manifest import record

SERVICE = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"
DEMO_FIPS = ("48201", "48167", "48453", "48085", "48355")  # Harris, Galveston, Travis, Collin, Nueces
WHERE = "SFHA_TF='T' OR ZONE_SUBTY LIKE '0.2 PCT%'"
PAGE = 2000
MAX_BYTES = 3_000_000
RAW = settings.RAW_DIR / "nfhl"
OUT_DIR = settings.UTILITY_MAP_DIR / "flood"
COUNTIES = settings.REPO_ROOT / "public" / "utility-map" / "data" / "counties.geojson"
CLASSES = ("0.2pct", "1pct", "floodway")  # drawing order, bottom to top


def flood_class(props: dict) -> str | None:
    subtype = str(props.get("ZONE_SUBTY") or "").upper()
    if "FLOODWAY" in subtype:
        return "floodway"
    if props.get("SFHA_TF") == "T":
        return "1pct"
    if subtype.startswith("0.2 PCT"):
        return "0.2pct"
    return None


def _rounded(geom):
    """Snap to ~1 m; fall back to plain coordinate rounding if GEOS rejects the topology."""
    try:
        return shapely.set_precision(shapely.make_valid(geom), 1e-5)
    except shapely.errors.GEOSException:
        return shapely.set_precision(geom, 1e-5, mode="pointwise")


def _collection(parts: dict, coastal: bool, tolerance: float) -> dict:
    features = []
    for name in CLASSES:
        geom = parts.get(name)
        if geom is None or geom.is_empty:
            continue
        if tolerance:
            geom = geom.simplify(tolerance, preserve_topology=True)
        geom = _rounded(geom)
        features.append({"type": "Feature", "properties": {"class": name, "coastal": coastal and name == "1pct"},
                         "geometry": mapping(geom)})
    return {"type": "FeatureCollection", "features": features}


def build_county(county, features: list[dict], max_bytes: int = MAX_BYTES) -> tuple[dict, float]:
    grouped: dict[str, list] = {name: [] for name in CLASSES}
    coastal = False
    for feature in features:
        name = flood_class(feature["properties"])
        if name is None or feature.get("geometry") is None:
            continue
        grouped[name].append(shape(feature["geometry"]).buffer(0))
        coastal |= name == "1pct" and str(feature["properties"].get("FLD_ZONE", "")).startswith("V")
    parts = {name: unary_union(geoms).intersection(county) for name, geoms in grouped.items() if geoms}
    sfha = unary_union([parts[n] for n in ("1pct", "floodway") if n in parts]) if parts else None
    sfha_pct = 0.0 if sfha is None or sfha.is_empty else 100.0 * sfha.area / county.area

    tolerance = 0.0
    geo = _collection(parts, coastal, tolerance)
    while len(json.dumps(geo)) > max_bytes:
        tolerance = tolerance * 2 if tolerance else 0.00005
        geo = _collection(parts, coastal, tolerance)
    return geo, min(sfha_pct, 100.0)


def _county_shapes() -> dict:
    return {f["properties"]["fips"]: shape(f["geometry"]) for f in json.loads(COUNTIES.read_text())["features"]}


def _get(url: str, tries: int = 5) -> bytes:
    """The NFHL service throws occasional 500s under load; back off and retry."""
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=300) as response:
                return response.read()
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
            if attempt == tries - 1:
                raise
            time.sleep(5 * 2**attempt)
    raise RuntimeError("unreachable")


def fetch(fips_list=DEMO_FIPS) -> None:
    shapes = _county_shapes()
    for fips in fips_list:
        folder = RAW / fips
        folder.mkdir(parents=True, exist_ok=True)
        bbox = ",".join(f"{v:.5f}" for v in shapes[fips].bounds)
        offset, page = 0, 0
        while True:
            path = folder / f"page_{page:03d}.geojson"
            if not path.exists():
                query = urllib.parse.urlencode({
                    "where": WHERE, "geometry": bbox, "geometryType": "esriGeometryEnvelope", "inSR": 4326,
                    "spatialRel": "esriSpatialRelIntersects", "outFields": "FLD_ZONE,ZONE_SUBTY,SFHA_TF",
                    "returnGeometry": "true", "outSR": 4326, "geometryPrecision": 5, "maxAllowableOffset": 0.00005,
                    "resultOffset": offset,
                    "resultRecordCount": PAGE, "orderByFields": "OBJECTID", "f": "geojson",
                })
                path.write_bytes(_get(f"{SERVICE}?{query}"))
            count = len(json.loads(path.read_text()).get("features", []))
            print(f"{fips} page {page}: {count} features")
            if count < PAGE:
                break
            offset += PAGE
            page += 1


def main(argv: list[str]) -> int:
    if argv[:1] == ["fetch"]:
        fetch()
        return 0
    shapes = _county_shapes()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows, pages = [], []
    for fips in DEMO_FIPS:
        files = sorted((RAW / fips).glob("page_*.geojson"))
        features = [f for path in files for f in json.loads(path.read_text()).get("features", [])]
        geo, pct = build_county(shapes[fips], features)
        (OUT_DIR / f"{fips}.geojson").write_text(json.dumps(geo, separators=(",", ":")))
        rows.append({"county_fips": fips, "sfha_land_pct": round(pct, 2), "polygons": len(features)})
        pages += files
        print(f"{fips}: {len(features)} source polygons, {pct:.1f}% in the 1% zone, "
              f"{(OUT_DIR / f'{fips}.geojson').stat().st_size / 1e6:.2f} MB")
    pd.DataFrame(rows).to_parquet(settings.UTILITY_MAP_DIR / "county_sfha.parquet", index=False)
    record("fema_nfhl", SERVICE.replace("/query", ""), *pages, rows=sum(r["polygons"] for r in rows),
           period_start=None, period_end=None,
           note=f"Flood Hazard Zones (S_FLD_HAZ_AR) for {', '.join(DEMO_FIPS)}; effective maps as served.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
