"""Assemble a versioned utility-map release (PRD v3) from the county and utility tables.

Phase 0 reads the existing real contract in public/utility-map/data (built by
pipeline.sources.eia861 and pipeline.map_layers) and upgrades it: every layer key on
every county with a quality flag, each utility's estimated county split, unknown Base
offers left unknown, and a pointer file the app reads to find the latest good release.

Run: python -m pipeline.utility_map.assemble
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
import shutil
import sys
from pathlib import Path

import pandas as pd
import yaml

from pipeline import settings
from pipeline.map_layers import percentile_ranks

V1_DIR = settings.REPO_ROOT / "public" / "utility-map" / "data"
PUBLIC_DIR = settings.REPO_ROOT / "public" / "utility-map"
SCHEMA_VERSION = "3.0"
TEXAS_COUNTIES = 254
KNOWN_OFFERS = {"energy_plus_backup", "backup_program", "energy_only"}

# Every layer in PRD v3 §5, plus the FEMA weather composite kept until the event
# layers replace it. Available layers carry their unit, period and sources here.
LAYERS: list[dict] = [
    {"id": "peak_demand", "group": "grid", "label": "Peak demand", "pending": "EIA-861 peak demand (UM-1.1)",
     "unit": "MW, estimated 2024 summer peak (each utility's peak split by its customers)",
     "period_start": "2024-01-01", "period_end": "2024-12-31", "source_ids": ["eia861", "ercot_load"],
     "method": "EIA-861 utility summer peak; wires companies without one get ERCOT weather-zone peak x their "
               "share of zone customers. Split to counties by estimated customers. Non-coincident peaks.",
     "table": "county_peak_demand.parquet"},
    {"id": "generation", "group": "grid", "label": "Local generation", "pending": "EIA-860 generators (UM-1.4)",
     "unit": "MW of operable power plants in the county (net summer capacity, 2024)",
     "period_start": "2024-01-01", "period_end": "2024-12-31", "source_ids": ["eia860"],
     "method": "EIA-860 operable generators summed by county. ERCOT is one connected grid: generation inside a "
               "county is not reserved for it, and transmission limits aren't modeled.",
     "table": "county_generation.parquet"},
    {"id": "price_spikes", "group": "grid", "label": "Price spikes",
     "unit": "hours per year at or above $1,000/MWh in the county's load zone (average)",
     "period_start": "2018-01-01", "period_end": "2025-12-31", "source_ids": ["ercot_rtm"],
     "method": "Mean annual hours with real-time settlement point price >= $1,000/MWh per load zone. "
               "County load zones are approximate."},
    {"id": "outages", "group": "grid", "label": "Long outages",
     "unit": "hours per customer per year in outages lasting 12 hours or more (estimate)",
     "period_start": "2018-01-01", "period_end": "2025-12-31", "source_ids": ["eaglei"],
     "method": "EAGLE-I 15-minute county outage counts cut into events; per-home durations assume the same "
               "homes stay dark while the count is above them. All dark hours of outages lasting 12 h or more, "
               "divided by modeled customers and years reporting.",
     "table": "county_outages.parquet"},
    {"id": "flood", "group": "hazard", "label": "Flood",
     "unit": "flood, flash-flood and coastal-flood event-days per year (NOAA, 2000-2025)",
     "period_start": "2000-01-01", "period_end": "2025-12-31", "source_ids": ["noaa_storm_events", "fema_nri", "fema_nfhl"],
     "method": "Rank = mean of the Texas ranks of NOAA flood event-days per year and FEMA NRI's flood risk score "
               "(larger of inland and coastal). Demo counties also show FEMA flood-zone maps and the share of land "
               "in the 1% annual-chance floodplain."},
    {"id": "tornado", "group": "hazard", "label": "Tornadoes", "pending": "NOAA SPC tornado tracks (UM-4.1)",
     "unit": "EF-weighted tornado path km per thousand km² per year (2000-2025)",
     "period_start": "2000-01-01", "period_end": "2025-12-31", "source_ids": ["spc_tornadoes"],
     "method": "NOAA SPC tracks split between the counties they cross (straight line start to end); each km "
               "weighted by EF rating + 1 (unknown = EF0), divided by county land area and years.",
     "table": "county_tornado.parquet"},
    {"id": "severe_storm", "group": "hazard", "label": "Hail and wind", "pending": "NOAA SPC hail and wind reports (UM-4.2)",
     "unit": "severe hail (1 inch+) and wind reports per thousand km² per year (2000-2025)",
     "period_start": "2000-01-01", "period_end": "2025-12-31", "source_ids": ["spc_hail_wind"],
     "method": "NOAA SPC report database, Texas. Reports depend on people seeing and filing them, so cities "
               "and highways show more than open country.",
     "table": "county_severe_storm.parquet"},
    {"id": "hurricane", "group": "hazard", "label": "Hurricanes", "pending": "NHC HURDAT2 tracks (UM-4.3)",
     "unit": "tropical-storm-force passes within 100 km per decade, weighted by wind (1980-2025)",
     "period_start": "1980-01-01", "period_end": "2025-12-31", "source_ids": ["nhc_hurdat2"],
     "method": "NHC best tracks interpolated hourly. Each storm whose 34 kt+ winds passed within 100 km of the "
               "county's interior point counts its strongest wind there ÷ 64 kt (a hurricane-force pass = 1).",
     "table": "county_hurricane.parquet"},
    {"id": "winter", "group": "hazard", "label": "Winter freeze", "pending": "NOAA Storm Events (UM-5.1)",
     "unit": "winter storm, ice, snow, cold and freeze event-days per year (NOAA, 2000-2025)",
     "period_start": "2000-01-01", "period_end": "2025-12-31", "source_ids": ["noaa_storm_events"],
     "method": "NOAA Storm Events filed for the county or its forecast zone; each county and local date counted "
               "once. Zone-based records, so shown by county only.",
     "table": "county_winter.parquet"},
    {"id": "heat", "group": "hazard", "label": "Extreme heat", "pending": "NOAA Storm Events (UM-5.1)",
     "unit": "heat and excessive-heat event-days per year (NOAA, 2000-2025)",
     "period_start": "2000-01-01", "period_end": "2025-12-31", "source_ids": ["noaa_storm_events"],
     "method": "NOAA Storm Events filed for the county or its forecast zone; each county and local date counted "
               "once. Reporting varies by NWS office, so compare neighbors with care.",
     "table": "county_heat.parquet"},
    {"id": "weather", "group": "hazard", "label": "Weather hazard (FEMA)",
     "unit": "FEMA NRI risk score, 0-100 (mean of winter, ice, hurricane, wind, tornado, heat)",
     "period_start": None, "period_end": "2025-12-01", "source_ids": ["fema_nri"],
     "method": "Mean of six FEMA NRI hazard risk scores. Stands in until the event-based hazard layers ship."},
    {"id": "homes", "group": "exposure", "label": "Homes exposed",
     "unit": "owner-occupied single-family homes (ACS 2020-2024)",
     "period_start": "2020-01-01", "period_end": "2024-12-31", "source_ids": ["acs_5yr"],
     "method": "ACS 5-year table B25032, owner-occupied one-unit homes by county."},
]
LAYER_IDS = [layer["id"] for layer in LAYERS]
HAZARD_IDS = [layer["id"] for layer in LAYERS if layer["group"] == "hazard" and layer["id"] != "weather"]
V1_TO_V3 = {"outages": "outages", "weather": "weather", "flood": "flood", "scarcity": "price_spikes", "homes": "homes"}

LENSES = [
    {"id": "winter", "label": "Winter freeze", "layers": ["winter", "outages", "price_spikes", "homes"]},
    {"id": "hurricane", "label": "Hurricane season", "layers": ["hurricane", "flood", "outages", "homes"]},
    {"id": "summer", "label": "Summer peak", "layers": ["heat", "peak_demand", "price_spikes", "homes"]},
    {"id": "storms", "label": "Severe storms", "layers": ["tornado", "severe_storm", "outages", "homes"]},
    {"id": "all_hazards", "label": "All hazards", "layers": HAZARD_IDS},
]

SOURCES = [
    {"id": "eaglei", "name": "DOE/ORNL EAGLE-I county outage records", "url": "https://doi.org/10.6084/m9.figshare.24237376"},
    {"id": "fema_nri", "name": "FEMA National Risk Index (December 2025)", "url": "https://hazards.fema.gov/nri/"},
    {"id": "ercot_rtm", "name": "ERCOT real-time settlement point prices", "url": "https://www.ercot.com/mktinfo/prices"},
    {"id": "acs_5yr", "name": "Census ACS 5-year 2020-2024, table B25032", "url": "https://api.census.gov/data/2024/acs/acs5/groups/B25032.html"},
    {"id": "eia861", "name": "EIA-861 2024 utility service territories and customers", "url": "https://www.eia.gov/electricity/data/eia861/"},
    {"id": "base_offers", "name": "Base Power pricing and offer pages", "url": "https://www.basepowercompany.com/pricing"},
    {"id": "noaa_storm_events", "name": "NOAA NCEI Storm Events Database", "url": "https://www.ncei.noaa.gov/stormevents/"},
    {"id": "fema_nfhl", "name": "FEMA National Flood Hazard Layer (effective flood maps)", "url": "https://www.fema.gov/flood-maps/national-flood-hazard-layer"},
    {"id": "spc_tornadoes", "name": "NOAA SPC Severe Weather Database (tornado tracks)", "url": "https://www.spc.noaa.gov/wcm/"},
    {"id": "eia860", "name": "EIA-860 2024 generator inventory", "url": "https://www.eia.gov/electricity/data/eia860/"},
    {"id": "spc_hail_wind", "name": "NOAA SPC Severe Weather Database (hail and wind reports)", "url": "https://www.spc.noaa.gov/wcm/"},
    {"id": "nhc_hurdat2", "name": "NOAA NHC HURDAT2 Atlantic best tracks", "url": "https://www.nhc.noaa.gov/data/#hurdat"},
    {"id": "ercot_load", "name": "ERCOT hourly native load by weather zone", "url": "https://www.ercot.com/gridinfo/load/load_hist"},
    {"id": "base_specs", "name": "Base Power Core specifications", "url": "https://www.basepowercompany.com/specs/core"},
]


def county_weights(crosswalk: pd.DataFrame) -> dict[str, list[dict]]:
    """Each utility's estimated customers and share in every county it serves."""
    out: dict[str, list[dict]] = {}
    for row in crosswalk.sort_values(["utility", "county_fips"]).itertuples(index=False):
        out.setdefault(str(row.utility), []).append(
            {"fips": str(row.county_fips).zfill(5), "customers_est": int(row.customers_est),
             "share": round(float(row.share), 4)}
        )
    return out


def offer_for(eia_utility_id: int | None, offers: dict[int, str]) -> tuple[str | None, str]:
    """Base's offer for a utility, or (None, "unverified") when the reference doesn't list one."""
    offer = offers.get(eia_utility_id) if eia_utility_id is not None else None
    return (offer, "listed") if offer in KNOWN_OFFERS else (None, "unverified")


def _quality(layer_id: str, value: object, load_zone: str | None) -> str:
    if value is not None:
        return "ok"
    if layer_id == "price_spikes" and load_zone is None:
        return "not_applicable"
    return "missing"


def _grid_status(grids: set[str]) -> str:
    if grids == {"ERCOT"}:
        return "ercot"
    return "mixed" if "ERCOT" in grids else "non_ercot"


def _layer_entry(meta: dict, counties: list[dict], available: bool) -> dict:
    entry = {key: value for key, value in meta.items() if key not in ("pending", "table")}
    entry["available"] = available
    if not available:
        entry.update(unit=None, period_start=None, period_end=None, source_ids=[], method=None,
                     unavailable_reason=f"Not built yet: {meta['pending']}")
    counts = {"ok": 0, "missing": 0, "not_applicable": 0}
    for county in counties:
        counts[county["quality"][meta["id"]]] += 1
    entry["coverage"] = counts
    return entry


def _lens(lens: dict, available: set[str]) -> dict:
    layers = [layer for layer in lens["layers"] if layer in available]
    if any(layer in HAZARD_IDS and layer not in available for layer in lens["layers"]):
        layers.append("weather")  # FEMA composite stands in until the event layers ship
    return {"id": lens["id"], "label": lens["label"], "layers": layers, "requested": lens["layers"]}


# Map files for the Hazards mode, copied into each release when they exist.
HAZARD_FILES = {
    "tornado": "hazards/tornado_tracks.geojson",
    "hurricane": "hazards/hurricane_tracks.geojson",
    "severe_storm": "hazards/severe_reports.geojson",
    "storms": "hazards/storms.json",
}
GRID_FILES = {"generators": "hazards/generators.geojson"}

GRID_STATS = ("summer_peak_mw", "winter_peak_mw", "sales_mwh", "residential_mwh", "peak_source")


def _grid_stats(grid: pd.DataFrame | None, eia_id: int | None) -> dict | None:
    if grid is None or eia_id is None or eia_id not in set(grid["utility_id"]):
        return None
    row = grid.loc[grid["utility_id"] == eia_id].iloc[0]
    return {key: (None if pd.isna(row[key]) else (row[key] if key == "peak_source" else float(row[key])))
            for key in GRID_STATS}


def upgrade(
    v1: dict,
    crosswalk: pd.DataFrame,
    offers: dict[int, str],
    tables: dict[str, pd.Series | pd.DataFrame] | None = None,
    utility_grid: pd.DataFrame | None = None,
    county_fields: dict[str, pd.Series] | None = None,
    outage_links: dict[str, dict] | None = None,
) -> dict:
    """Turn the phase-0 contract into the PRD v3 shape. Pure: no files touched.

    tables maps a layer id to county values (index = FIPS) from a normalizer: a Series,
    ranked across Texas here, or a DataFrame with "value" and its own combined "rank".
    """
    county_fields = county_fields or {}
    fips_index = [c["fips"] for c in v1["counties"]]
    values_by_layer: dict[str, pd.Series] = {}
    extra_ranks: dict[str, pd.Series] = {}
    for layer, table in (tables or {}).items():
        if isinstance(table, pd.DataFrame):
            values_by_layer[layer] = table["value"]
            extra_ranks[layer] = (table["rank"] if "rank" in table
                                  else percentile_ranks(table["value"].reindex(fips_index).astype(float)))
        else:
            values_by_layer[layer] = table
            extra_ranks[layer] = percentile_ranks(table.reindex(fips_index).astype(float))
    tables = values_by_layer
    weights = county_weights(crosswalk)
    ranked = crosswalk.sort_values(["county_fips", "share"], ascending=[True, False])
    members = ranked.groupby("county_fips")["utility"].apply(list).to_dict()
    grids = ranked.groupby("county_fips")["grid"].apply(set).to_dict()

    counties = []
    for old in v1["counties"]:
        fips = old["fips"]
        values = dict.fromkeys(LAYER_IDS)
        ranks = dict.fromkeys(LAYER_IDS)
        for v1_id, v3_id in V1_TO_V3.items():
            values[v3_id] = old["values"].get(v1_id)
            ranks[v3_id] = old["ranks"].get(v1_id)
        for layer, series in tables.items():
            value = series.get(fips)
            values[layer] = None if value is None or pd.isna(value) else float(value)
            rank = extra_ranks[layer].get(fips)
            ranks[layer] = None if rank is None or pd.isna(rank) else float(rank)
        quality = {layer: _quality(layer, values[layer], old["load_zone"]) for layer in LAYER_IDS}
        utilities = members.get(fips, old["utilities"])
        counties.append({
            **{key: old[key] for key in ("fips", "name", "customers", "load_zone", "centroid")},
            "utilities": utilities,
            "primary_utility": utilities[0] if utilities else None,
            "grid_status": _grid_status(grids.get(fips, set())),
            "load_zone_method": "approximate" if old["load_zone"] else None,
            "values": values,
            "ranks": ranks,
            "quality": quality,
            **{name: (None if pd.isna(series.get(fips)) else float(series.get(fips)))
               for name, series in county_fields.items()},
        })

    utilities = []
    for old in v1["utilities"]:
        offer, verification = offer_for(old.get("eia_utility_id"), offers)
        mine = weights.get(old["id"], [])
        utility_grids = sorted(set(crosswalk.loc[crosswalk["utility"] == old["id"], "grid"])) or [old["grid"]]
        utilities.append({
            **old,
            "scored": True,
            "base_offer": offer,
            "offer_verification": verification,
            "grids": utility_grids,
            "counties": [w["fips"] for w in mine] or old["counties"],
            "county_weights": mine,
            "household_proxy_method": "County owner-occupied single-family homes x estimated customer share",
            "grid_stats": _grid_stats(utility_grid, old.get("eia_utility_id")),
        })

    available = {layer["id"] for layer in LAYERS if "pending" not in layer} | set(tables)
    return {
        "schema_version": SCHEMA_VERSION,
        "release_id": None,
        "mock": False,
        "data_mode": "partial",
        "as_of": v1["as_of"],
        "note": v1["note"],
        "layers": [
            {**_layer_entry(meta, counties, meta["id"] in available),
             "outage_link": (outage_links or {}).get(meta["id"])}
            for meta in LAYERS
        ],
        "presets": [_lens(lens, available) for lens in LENSES],
        "battery": {
            **v1["battery"],
            "reserve_fraction": 0.2,
            "backup_hours_assumed": 12,
            "dispatch_window_h": 2,
            "power_basis": "nameplate_upper_bound",
            "source_ids": ["base_specs"],
        },
        "scoring": {
            "method_version": "3.0-phase0",
            "rank_method": "(average tie rank - 1) / (n valid - 1); null when fewer than 2 values",
            "peer_scope": "texas_counties",
            "expansion_level": 3,
        },
        "sources": SOURCES,
        "live": {"status": "unavailable", "as_of": None, "ercot": None, "alerts": []},
        "counties": counties,
        "utilities": utilities,
        "geometry": v1["geometry"],
    }


def release_id(release: dict, today: str) -> str:
    body = {key: value for key, value in release.items() if key not in ("release_id", "as_of")}
    digest = hashlib.sha256(json.dumps(body, sort_keys=True, allow_nan=True).encode()).hexdigest()
    return f"{today}-{digest[:8]}"


def _finite(value: object) -> bool:
    return value is None or not isinstance(value, float) or math.isfinite(value)


def check(release: dict, expected_counties: int = TEXAS_COUNTIES) -> list[str]:
    """Release gates for phase 0. Returns a list of problems; empty means publishable."""
    problems: list[str] = []
    counties = release["counties"]
    fips = [c["fips"] for c in counties]
    if len(counties) != expected_counties:
        problems.append(f"expected {expected_counties} counties, found {len(counties)}")
    if len(set(fips)) != len(fips):
        problems.append("duplicate county FIPS")
    problems += [f"bad FIPS {f}" for f in fips if len(f) != 5 or not f.startswith("48")]
    utility_ids = {u["id"] for u in release["utilities"]}
    for county in counties:
        for layer in LAYER_IDS:
            value, rank = county["values"][layer], county["ranks"][layer]
            if not (_finite(value) and _finite(rank)):
                problems.append(f"{county['fips']} {layer}: value and rank must be finite or null")
                continue
            if (value is None) == (county["quality"][layer] == "ok"):
                problems.append(f"{county['fips']} {layer}: quality {county['quality'][layer]} disagrees with value")
            if rank is not None and not 0 <= rank <= 1:
                problems.append(f"{county['fips']} {layer}: rank {rank} outside [0, 1]")
        problems += [f"{county['fips']}: unknown utility {u}" for u in county["utilities"] if u not in utility_ids]
    share_sum: dict[str, float] = {}
    for utility in release["utilities"]:
        for weight in utility["county_weights"]:
            if not 0 <= weight["share"] <= 1:
                problems.append(f"{utility['id']} {weight['fips']}: share {weight['share']} outside [0, 1]")
            share_sum[weight["fips"]] = share_sum.get(weight["fips"], 0.0) + weight["share"]
    problems += [f"{f}: utility shares sum to {total:.4f}, not 1"
                 for f, total in sorted(share_sum.items()) if abs(total - 1) > 1e-3]
    for layer in release["layers"]:
        if not layer["available"]:
            continue
        if not layer.get("source_ids"):
            problems.append(f"layer {layer['id']}: no source listed")
        if not layer.get("period_end"):
            problems.append(f"layer {layer['id']}: no period recorded (period_end is its as-of date)")
    return problems


def _file_names(geometry: dict) -> list[str]:
    names: list[str] = []
    for value in geometry.values():
        names += _file_names(value) if isinstance(value, dict) else [value]
    return names


MAX_FILE_BYTES = 5_000_000


def publish(release: dict, geometry_dir: Path, public_dir: Path, today: str,
            expected_counties: int = TEXAS_COUNTIES, extra_files: dict[str, Path] | None = None,
            max_file_bytes: int = MAX_FILE_BYTES) -> str:
    """Write releases/<id>/ and point current.json at it, only if every check passes."""
    problems = check(release, expected_counties)
    for name in _file_names(release["geometry"]):
        source = (extra_files or {}).get(name, geometry_dir / name)
        if not source.exists():
            problems.append(f"{name}: file missing")
        elif source.stat().st_size > max_file_bytes:
            problems.append(f"{name}: {source.stat().st_size:,} bytes is over the {max_file_bytes:,} byte cap")
    if problems:
        raise ValueError("release failed checks: " + "; ".join(problems[:20]))
    release = copy.deepcopy(release)
    rid = release_id(release, today)
    release["release_id"] = rid
    folder = public_dir / "releases" / rid
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "utility-map.json").write_text(json.dumps(release, separators=(",", ":"), allow_nan=False))
    for name in _file_names(release["geometry"]):
        target = folder / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile((extra_files or {}).get(name, geometry_dir / name), target)
    report = {
        "release_id": rid,
        "passed": True,
        "checked_at": pd.Timestamp.now(tz="UTC").isoformat(),
        "counties": len(release["counties"]),
        "utilities": len(release["utilities"]),
        "layers_available": [l["id"] for l in release["layers"] if l["available"]],
        "layers_pending": [l["id"] for l in release["layers"] if not l["available"]],
        "files": {name: (folder / name).stat().st_size for name in _file_names(release["geometry"])},
    }
    (folder / "gate-report.json").write_text(json.dumps(report, indent=2) + "\n")
    pointer = {"release_id": rid, "path": f"releases/{rid}", "schema_version": SCHEMA_VERSION}
    (public_dir / "current.json").write_text(json.dumps(pointer, indent=2) + "\n")
    return rid


def load_offers(path: Path = settings.BASE_AVAILABILITY_YAML) -> dict[int, str]:
    rows = yaml.safe_load(path.read_text())["utilities"]
    return {int(row["eia_utility_id"]): row.get("offer") for row in rows if "eia_utility_id" in row}


def main() -> int:
    v1 = json.loads((V1_DIR / "utility-map.json").read_text())
    crosswalk = pd.read_csv(settings.COUNTY_UTILITY_CSV, dtype={"county_fips": str})
    tables = {}
    for meta in LAYERS:
        path = settings.UTILITY_MAP_DIR / meta.get("table", "")
        if "table" in meta and path.exists():
            frame = pd.read_parquet(path)
            tables[meta["id"]] = frame.set_index("county_fips").iloc[:, 0]
    county_fields = {}
    outages_path = settings.UTILITY_MAP_DIR / "county_outages.parquet"
    if outages_path.exists():
        outages = pd.read_parquet(outages_path).set_index("county_fips")
        ok = outages["quality"] == "ok"
        tables["outages"] = outages["long_hours_per_customer_year"].where(ok)
        county_fields["outage_coverage_12h"] = outages["coverage_12h"].where(ok)
    flood_path = settings.UTILITY_MAP_DIR / "county_flood.parquet"
    if flood_path.exists():
        tables["flood"] = pd.read_parquet(flood_path).set_index("county_fips")[["value", "rank"]]
    sfha_path = settings.UTILITY_MAP_DIR / "county_sfha.parquet"
    extra_files: dict[str, Path] = {}
    flood_files: dict[str, str] = {}
    if sfha_path.exists():
        sfha = pd.read_parquet(sfha_path).set_index("county_fips")["sfha_land_pct"]
        county_fields["sfha_land_pct"] = sfha
        for fips in sfha.index:
            name = f"flood/{fips}.geojson"
            flood_files[fips] = name
            extra_files[name] = settings.UTILITY_MAP_DIR / name
    grid_path = settings.UTILITY_MAP_DIR / "utility_grid.parquet"
    utility_grid = pd.read_parquet(grid_path) if grid_path.exists() else None
    links_path = settings.UTILITY_MAP_DIR / "hazard_validation.json"
    links = json.loads(links_path.read_text()) if links_path.exists() else None
    release = upgrade(v1, crosswalk, load_offers(), tables=tables, utility_grid=utility_grid,
                      county_fields=county_fields, outage_links=links)
    if flood_files:
        release["geometry"]["flood"] = flood_files
    hazards = {k: v for k, v in HAZARD_FILES.items() if (settings.UTILITY_MAP_DIR / v).exists()}
    if hazards:
        release["geometry"]["hazards"] = hazards
        extra_files.update({v: settings.UTILITY_MAP_DIR / v for v in hazards.values()})
    grid_files = {k: v for k, v in GRID_FILES.items() if (settings.UTILITY_MAP_DIR / v).exists()}
    if grid_files:
        release["geometry"]["grid"] = grid_files
        extra_files.update({v: settings.UTILITY_MAP_DIR / v for v in grid_files.values()})
    generation_path = settings.UTILITY_MAP_DIR / "county_generation.parquet"
    if generation_path.exists():
        mix = pd.read_parquet(generation_path).set_index("county_fips")
        for fuel in ("solar", "wind", "gas", "coal", "nuclear", "storage", "other"):
            release_mix = mix[f"{fuel}_mw"]
            for county in release["counties"]:
                county.setdefault("generation_mix", {})[fuel] = float(release_mix.get(county["fips"], 0.0))
    today = pd.Timestamp.now(tz="America/Chicago").date().isoformat()
    rid = publish(release, V1_DIR, PUBLIC_DIR, today, extra_files=extra_files)
    unverified = sum(u["base_offer"] is None for u in release["utilities"])
    print(f"published {rid}: {len(release['counties'])} counties, {len(release['utilities'])} utilities "
          f"({unverified} with an unverified Base offer)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
