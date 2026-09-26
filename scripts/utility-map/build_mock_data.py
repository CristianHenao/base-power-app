"""Build DUMMY data for the /utility-map mockup (playbook sheet P-04).

Everything here is invented for layout and interaction work. County shapes are
real (Census 2010 20m cartographic boundaries via the plotly datasets mirror);
utility territories, layer values, customers and live warnings are not.

Output (public/utility-map/mock/):
  utility-map.json          the P-04 data contract, with dummy values and ranks
  counties.geojson          Texas county polygons keyed by FIPS
  territories.geojson       counties merged into one outline per utility

Needs shapely (pip install shapely). The county file does not share vertices
between neighbors, so territories are merged with a small buffer to close gaps.

Run: python3 scripts/utility-map/build_mock_data.py
"""

from __future__ import annotations

import json
import math
import random
import urllib.request
from pathlib import Path

from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "utility-map" / "mock"
CACHE = ROOT / "data" / "raw" / "us-counties-20m.json"  # gitignored
COUNTIES_URL = (
    "https://raw.githubusercontent.com/plotly/datasets/master/"
    "geojson-counties-fips.json"
)

# Base offer per G-02: CenterPoint and Oncor list Energy + Backup; AEP Texas
# Central/North and TNMP are energy only; the co-ops, Austin Energy and El Paso
# Electric run their own backup programs. Unscored utilities are drawn only.
UTILITIES = [
    ("oncor", "Oncor", "ERCOT", "energy_plus_backup", True),
    ("centerpoint", "CenterPoint", "ERCOT", "energy_plus_backup", True),
    ("aep_central", "AEP Texas Central", "ERCOT", "energy_only", True),
    ("aep_north", "AEP Texas North", "ERCOT", "energy_only", True),
    ("tnmp", "TNMP", "ERCOT", "energy_only", True),
    ("austin_energy", "Austin Energy", "ERCOT", "backup_program", True),
    ("gvec", "GVEC", "ERCOT", "backup_program", True),
    ("coserv", "CoServ", "ERCOT", "backup_program", True),
    ("farmers_ec", "Farmers EC", "ERCOT", "backup_program", True),
    ("el_paso_electric", "El Paso Electric", "WECC", "backup_program", True),
    ("cps_energy", "CPS Energy", "ERCOT", "none", False),
    ("pedernales", "Pedernales EC", "ERCOT", "none", False),
    ("bluebonnet", "Bluebonnet EC", "ERCOT", "none", False),
    ("entergy_tx", "Entergy Texas", "MISO", "none", False),
    ("swepco", "SWEPCO", "SPP", "none", False),
    ("xcel_sps", "Xcel Energy (SPS)", "SPP", "none", False),
    ("other_coops", "Other co-ops", "ERCOT", "none", False),
]

# Rough anchor towns per utility; counties go to the nearest anchor.
ANCHORS = {
    "centerpoint": [(-95.37, 29.76)],
    "oncor": [(-96.80, 32.78), (-97.33, 32.75), (-97.15, 31.55), (-95.30, 32.35),
              (-102.08, 31.99), (-97.73, 31.12), (-98.49, 33.91)],
    "aep_central": [(-97.40, 27.80), (-98.23, 26.20), (-99.50, 27.50), (-97.00, 28.80)],
    "aep_north": [(-99.73, 32.45), (-100.44, 31.46), (-102.88, 30.89)],
    "entergy_tx": [(-94.10, 30.08), (-95.46, 30.31)],
    "swepco": [(-94.74, 32.50), (-94.05, 33.43)],
    "xcel_sps": [(-101.83, 35.20), (-101.85, 33.58)],
    "pedernales": [(-98.42, 30.28), (-98.87, 30.27)],
}
OVERRIDES = {
    "Travis": "austin_energy", "Bexar": "cps_energy",
    "El Paso": "el_paso_electric", "Hudspeth": "el_paso_electric",
    "Culberson": "el_paso_electric",
    "Galveston": "tnmp", "Reeves": "tnmp", "Ward": "tnmp", "Loving": "tnmp",
    "Somervell": "tnmp", "Erath": "tnmp",
    "Guadalupe": "gvec", "Gonzales": "gvec", "DeWitt": "gvec",
    "Denton": "coserv", "Hunt": "farmers_ec", "Rains": "farmers_ec",
    "Bastrop": "bluebonnet", "Lee": "bluebonnet", "Fayette": "bluebonnet",
    "Washington": "bluebonnet",
}
MAX_ANCHOR_DEG = 1.6  # beyond this from any anchor, a county is "other co-ops"

POPULATION = {  # rounded, for dummy customer counts only
    "Harris": 4.8e6, "Dallas": 2.6e6, "Tarrant": 2.2e6, "Bexar": 2.1e6,
    "Travis": 1.35e6, "Collin": 1.2e6, "Denton": 1.0e6, "Hidalgo": 0.9e6,
    "Fort Bend": 0.9e6, "El Paso": 0.87e6, "Montgomery": 0.7e6,
    "Williamson": 0.7e6, "Cameron": 0.43e6, "Brazoria": 0.4e6, "Bell": 0.39e6,
    "Galveston": 0.36e6, "Nueces": 0.35e6, "Lubbock": 0.32e6, "Webb": 0.27e6,
    "McLennan": 0.27e6, "Hays": 0.27e6, "Jefferson": 0.25e6, "Smith": 0.24e6,
    "Brazos": 0.24e6, "Ellis": 0.2e6, "Johnson": 0.2e6, "Guadalupe": 0.18e6,
    "Comal": 0.18e6, "Midland": 0.17e6, "Kaufman": 0.17e6, "Ector": 0.16e6,
    "Parker": 0.16e6, "Taylor": 0.14e6, "Randall": 0.14e6, "Grayson": 0.14e6,
    "Wichita": 0.13e6, "Potter": 0.12e6, "Gregg": 0.12e6, "Rockwall": 0.12e6,
    "Tom Green": 0.12e6, "Hunt": 0.1e6,
}

# ERCOT load zone per utility, for the dummy grid-scarcity layer.
LOAD_ZONE = {"centerpoint": "LZ_HOUSTON", "austin_energy": "LZ_AEN",
             "cps_energy": "LZ_CPS", "aep_north": "LZ_WEST", "tnmp": "LZ_NORTH"}
SCARCITY_HOURS = {"LZ_WEST": 38, "LZ_HOUSTON": 30, "LZ_SOUTH": 27,
                  "LZ_NORTH": 22, "LZ_CPS": 21, "LZ_AEN": 20}

LAYERS = [
    {"id": "outages", "label": "Outage history",
     "unit": "long-outage hours per customer per year", "source": "eaglei",
     "as_of": "2024-12-31"},
    {"id": "weather", "label": "Weather hazard",
     "unit": "hazard index, 0-100 (winter, hurricane, heat, wind, tornado)",
     "source": "fema_nri", "as_of": "2025-03-01"},
    {"id": "flood", "label": "Flood", "unit": "flood index, 0-100",
     "source": "fema_nri", "as_of": "2025-03-01"},
    {"id": "scarcity", "label": "Grid scarcity",
     "unit": "scarcity hours per year in the load zone", "source": "ercot_rtm",
     "as_of": "2025-12-31"},
    {"id": "homes", "label": "Homes exposed",
     "unit": "owner-occupied single-family homes", "source": "acs_5yr",
     "as_of": "2024-12-31"},
]


def load_counties() -> list[dict]:
    if not CACHE.exists():
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(COUNTIES_URL, CACHE)
    features = json.loads(CACHE.read_text())["features"]
    return [f for f in features if f["properties"]["STATE"] == "48"]


def rings(geometry: dict) -> list[list[list[float]]]:
    if geometry["type"] == "Polygon":
        return geometry["coordinates"]
    return [r for poly in geometry["coordinates"] for r in poly]


def centroid(geometry: dict) -> tuple[float, float]:
    pts = [p for r in rings(geometry) for p in r]
    return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def assign_utility(name: str, lon: float, lat: float) -> str:
    if name in OVERRIDES:
        return OVERRIDES[name]
    best, best_d = "other_coops", MAX_ANCHOR_DEG
    for uid, pts in ANCHORS.items():
        for alon, alat in pts:
            d = math.hypot((lon - alon) * math.cos(math.radians(lat)), lat - alat)
            if d < best_d:
                best, best_d = uid, d
    return best


def load_zone(uid: str, lon: float, lat: float) -> str | None:
    grid = next(u[2] for u in UTILITIES if u[0] == uid)
    if grid != "ERCOT":
        return None
    if uid in LOAD_ZONE:
        return LOAD_ZONE[uid]
    if lon < -100.5:
        return "LZ_WEST"
    return "LZ_SOUTH" if lat < 30.2 else "LZ_NORTH"


GULF_COAST = [(-97.2, 25.9), (-97.4, 27.0), (-97.2, 27.8), (-96.5, 28.3),
              (-95.5, 28.8), (-94.7, 29.3), (-93.8, 29.7)]


def coast_distance(lon: float, lat: float) -> float:
    """Degrees to the nearest point on a rough Gulf coastline polyline."""
    best = math.inf
    for (ax, ay), (bx, by) in zip(GULF_COAST, GULF_COAST[1:]):
        dx, dy = bx - ax, by - ay
        t = max(0.0, min(1.0, ((lon - ax) * dx + (lat - ay) * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(lon - (ax + t * dx), lat - (ay + t * dy)))
    return best


def dummy_values(fips: str, lon: float, lat: float, zone: str | None,
                 homes: int) -> dict[str, float | None]:
    rng = random.Random(int(fips))
    coast = max(0.0, 1 - coast_distance(lon, lat) / 2.2)  # Gulf coast
    east = max(0.0, min(1.0, (lon + 97.5) / 3.5))  # pine belt, ice on lines
    north = max(0.0, min(1.0, (lat - 29.0) / 7.0))
    alley = max(0.0, 1 - math.hypot(lon + 98.0, lat - 30.2) / 1.2)  # flash flood alley
    outages = 1.2 + 5.5 * coast + 3.0 * east + 1.2 * north + rng.uniform(-0.8, 1.6)
    weather = 25 + 35 * coast + 20 * north + 10 * east + rng.uniform(-8, 8)
    flood = 15 + 55 * coast + 45 * alley + rng.uniform(-6, 10)
    return {
        "outages": round(max(0.3, outages), 2),
        "weather": round(min(100, max(5, weather)), 1),
        "flood": round(min(100, max(3, flood)), 1),
        "scarcity": None if zone is None else SCARCITY_HOURS[zone] + rng.randint(-3, 3),
        "homes": homes,
    }


def percentile_ranks(values: dict[str, float | None]) -> dict[str, float | None]:
    present = sorted(v for v in values.values() if v is not None)
    n = len(present)
    out: dict[str, float | None] = {}
    for key, v in values.items():
        if v is None:
            out[key] = None
            continue
        below = sum(1 for p in present if p < v)
        equal = sum(1 for p in present if p == v)
        out[key] = round((below + (equal - 1) / 2) / (n - 1), 3) if n > 1 else 0.5
    return out


def territories(features: list[dict], owner: dict[str, str]) -> dict:
    """Merge each utility's counties into one outline."""
    by_utility: dict[str, list] = {}
    for f in features:
        by_utility.setdefault(owner[f["id"]], []).append(shape(f["geometry"]))
    out = []
    for uid, shapes in by_utility.items():
        merged = unary_union([g.buffer(0.01) for g in shapes]).buffer(-0.01)
        merged = merged.simplify(0.005, preserve_topology=True)
        out.append({"type": "Feature", "properties": {"utility": uid},
                    "geometry": mapping(merged)})
    return {"type": "FeatureCollection", "features": out}


def main() -> None:
    features = load_counties()
    counties, owner, geo = [], {}, []
    for f in sorted(features, key=lambda f: f["id"]):
        fips, name = f["id"], f["properties"]["NAME"]
        lon, lat = centroid(f["geometry"])
        uid = assign_utility(name, lon, lat)
        owner[fips] = uid
        rng = random.Random(int(fips) * 7)
        population = POPULATION.get(name, rng.uniform(2_000, 60_000))
        customers = int(population / 2.6)
        homes = int(customers * rng.uniform(0.45, 0.62))
        zone = load_zone(uid, lon, lat)
        counties.append({
            "fips": fips, "name": name, "utilities": [uid], "customers": customers,
            "load_zone": zone, "centroid": [round(lon, 4), round(lat, 4)],
            "values": dummy_values(fips, lon, lat, zone, homes),
        })
        geo.append({"type": "Feature", "id": int(fips),
                    "properties": {"fips": fips, "name": name},
                    "geometry": f["geometry"]})

    for layer in LAYERS:
        ranks = percentile_ranks({c["fips"]: c["values"][layer["id"]] for c in counties})
        for c in counties:
            c.setdefault("ranks", {})[layer["id"]] = ranks[c["fips"]]

    utilities = []
    for uid, name, grid, offer, scored in UTILITIES:
        mine = [c for c in counties if c["utilities"][0] == uid]
        if not mine:
            continue
        weight = sum(c["customers"] for c in mine)
        label = max(mine, key=lambda c: c["customers"])["centroid"]
        rng = random.Random(uid)
        utilities.append({
            "id": uid, "name": name, "grid": grid, "scored": scored,
            "base_offer": offer, "counties": [c["fips"] for c in mine],
            "customers": weight,
            "eligible_homes": sum(c["values"]["homes"] for c in mine),
            "label_point": label,
            # Share of long-outage hours one Core would have covered (M-01 style).
            "core_coverage_hours": round(rng.uniform(0.62, 0.86), 2),
        })

    warned = {"Travis": "Flash Flood Warning", "Hays": "Flash Flood Warning",
              "Comal": "Flash Flood Warning", "Hidalgo": "Heat Advisory",
              "Cameron": "Heat Advisory", "Nueces": "Heat Advisory",
              "Wichita": "Severe Thunderstorm Watch"}
    alerts = [{"fips": c["fips"], "event": warned[c["name"]]}
              for c in counties if c["name"] in warned]

    contract = {
        "mock": True,
        "as_of": "2026-09-25",
        "note": "DUMMY DATA for the /utility-map mockup. Territories, values, "
                "customers and alerts are invented; county shapes are real.",
        "layers": LAYERS,
        "presets": [
            {"id": "winter", "label": "Winter freeze", "layers": ["outages", "weather", "homes"]},
            {"id": "hurricane", "label": "Hurricane season",
             "layers": ["outages", "weather", "flood", "homes"]},
            {"id": "summer", "label": "Summer peak", "layers": ["scarcity", "weather", "homes"]},
        ],
        "battery": {"kwh_per_core": 39.2, "kw_per_core": 20},
        "live": {"as_of": "2026-09-25T22:15:00-05:00", "ercot": "normal",
                 "alerts": alerts},
        "counties": counties,
        "utilities": utilities,
        "geometry": {"counties": "counties.geojson",
                     "territories": "territories.geojson"},
    }

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "utility-map.json").write_text(json.dumps(contract, separators=(",", ":")))
    (OUT / "counties.geojson").write_text(json.dumps(
        {"type": "FeatureCollection", "features": geo}, separators=(",", ":")))
    (OUT / "territories.geojson").write_text(json.dumps(
        territories(features, owner), separators=(",", ":")))
    for u in utilities:
        print(f"{u['name']:<20} {len(u['counties']):>3} counties  "
              f"{u['customers']:>9,} customers  scored={u['scored']}")


if __name__ == "__main__":
    main()
