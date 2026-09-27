"""Report assembly for the API: place lookup, the offline report, live alerts and the narrative.

Every outside dependency degrades to a source status. Only a missing county (no address
match and no county_fips) stops a report.
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
import threading
import uuid
from collections.abc import Callable
from pathlib import Path

import duckdb

from api.app.adapters import AdapterError, TTLCache, census, nws
from api.app.adapters.ercot import SnapshotWorker
from api.app.metrics import Metrics
from api.app.narrator.facts import from_contract
from api.app.narrator.narrate import ModelCall, narrate
from api.app.schemas import Report, ReportRequest
from pipeline import settings
from pipeline.reports import build_report

PROFILE_BY_HEAT = {"electric": "RESHIWR", "gas": "RESLOWR"}
TEXAS_ZIP = re.compile(r"\b(7[5-9]\d{3})(?:-\d{4})?\b")


def load_zip_counties(path: Path) -> dict[str, str]:
    """Texas ZIP to its majority county (pipeline/zip_county.py); empty if the file is missing."""
    if not path.exists():
        return {}
    with path.open() as handle:
        return {row["zip"]: row["county_fips"] for row in csv.DictReader(handle)}


def load_centroids(path: Path) -> dict[str, tuple[float, float]]:
    """County (latitude, longitude) from the sales map's county list; empty if missing."""
    if not path.exists():
        return {}
    counties = json.loads(path.read_text()).get("counties", [])
    return {c["fips"]: (float(c["centroid"][1]), float(c["centroid"][0])) for c in counties if c.get("centroid")}


def zip_in(text: str) -> str | None:
    """The last Texas ZIP written in an address, if any."""
    found = TEXAS_ZIP.findall(text)
    return found[-1] if found else None
FAULTS = frozenset({"census", "nws", "llm", "ercot"})
REPORT_TTL_S = 3600.0


class PlaceNotFound(LookupError):
    """No county could be resolved for the request."""


class ReportService:
    def __init__(
        self,
        features_path: Path,
        call: ModelCall | None,
        metrics: Metrics,
        geocode: Callable[[str], census.Place] = census.geocode,
        alerts: Callable[[float, float], list[dict]] = nws.active_alerts,
        last_good_alerts: Callable[[float, float], list[dict] | None] = nws.last_good_alerts,
        grid: SnapshotWorker | None = None,
        zip_counties: dict[str, str] | None = None,
        centroids: dict[str, tuple[float, float]] | None = None,
    ) -> None:
        self.grid = grid
        self._zip_counties = load_zip_counties(settings.ZIP_COUNTY_CSV) if zip_counties is None else zip_counties
        self._centroids = load_centroids(settings.COUNTY_CENTROIDS_JSON) if centroids is None else centroids
        self._con = duckdb.connect(str(features_path), read_only=True)
        self._call = call
        self._metrics = metrics
        self._geocode = geocode
        self._alerts = alerts
        self._last_good_alerts = last_good_alerts
        self._reports: TTLCache[dict] = TTLCache(ttl_s=REPORT_TTL_S, max_items=2048)
        # Validated narratives by the facts they were written from; identical facts reuse them.
        self._narratives: TTLCache[dict] = TTLCache(ttl_s=REPORT_TTL_S, max_items=1024)
        self._faults: set[str] = set()
        self._lock = threading.Lock()

    @property
    def faults(self) -> frozenset[str]:
        return frozenset(self._faults)

    def set_faults(self, names: set[str]) -> None:
        unknown = names - FAULTS
        if unknown:
            raise ValueError(f"unknown faults: {', '.join(sorted(unknown))}")
        with self._lock:
            self._faults = set(names)

    def _record(self, adapter: str, status: str) -> None:
        self._metrics.adapter(adapter, status)

    def _place(self, request: ReportRequest) -> tuple[str, census.Place | None, dict]:
        """County FIPS, the geocoded place when there is one, and the census source status."""
        if not request.address:
            if not request.zip:
                return str(request.county_fips), None, {"id": "census", "status": "not_connected"}
            fips = request.county_fips or self._zip_counties.get(request.zip)
            if not fips:
                raise PlaceNotFound("we could not find that ZIP in Texas")
            center = self._centroids.get(fips)
            place = census.Place(fips, None, center[0], center[1], request.zip, "TX") if center else None
            return fips, place, {"id": "census", "status": "degraded", "fallback": "zip"}
        try:
            if "census" in self._faults:
                raise AdapterError("census fault injected")
            place = self._geocode(request.address)
            self._record("census", "ok")
        except AdapterError:
            self._record("census", "degraded")
            fips = request.county_fips or self._zip_counties.get(request.zip or zip_in(request.address) or "")
            if fips:
                # The street did not match (the demo homes use made-up streets); the ZIP still places the county.
                zip_code = request.zip or zip_in(request.address)
                center = self._centroids.get(fips)
                place = census.Place(fips, None, center[0], center[1], zip_code, "TX") if center else None
                return fips, place, {"id": "census", "status": "degraded", "fallback": "zip"}
            raise PlaceNotFound("we could not find that address; try adding the city and ZIP") from None
        if not place.county_fips.startswith("48"):
            raise ValueError("Porchlight covers Texas addresses only")
        return place.county_fips, place, {"id": "census", "status": "ok"}

    def _live_alerts(self, place: census.Place | None) -> tuple[list[dict], dict]:
        if place is None:
            return [], {"id": "nws", "status": "unavailable"}
        try:
            if "nws" in self._faults:
                raise AdapterError("nws fault injected")
            alerts = self._alerts(place.latitude, place.longitude)
            self._record("nws", "ok")
            return alerts, {"id": "nws", "status": "ok"}
        except AdapterError:
            self._record("nws", "degraded")
            stale = None if "nws" in self._faults else self._last_good_alerts(place.latitude, place.longitude)
            if stale is not None:
                return stale, {"id": "nws", "status": "degraded", "fallback": "cache"}
            return [], {"id": "nws", "status": "degraded"}

    def _grid(self, load_zone: str | None) -> tuple[dict | None, dict]:
        """The snapshot worker's last good ERCOT conditions, with this load zone's price."""
        if self.grid is None:
            return None, {"id": "ercot_live", "status": "not_connected"}
        snapshot, status = (None, "degraded") if "ercot" in self._faults else self.grid.current()
        self._record("ercot", status)
        if snapshot is None:
            return None, {"id": "ercot_live", "status": status}
        grid = {key: snapshot.get(key) for key in
                ("status", "note", "eea_level", "reserves_mw", "demand_mw", "capacity_mw", "as_of", "stale")}
        grid["load_zone"] = load_zone
        grid["price_mwh"] = snapshot["prices_mwh"].get(load_zone) if load_zone else None
        return grid, {"id": "ercot_live", "status": status, "as_of": snapshot["as_of"]}

    def create(self, request: ReportRequest) -> dict:
        fips, place, census_source = self._place(request)
        profile = PROFILE_BY_HEAT.get(request.heat) if request.heat else None
        zip_code = request.zip or (place.zip_code if place else None)
        report = build_report(self._con.cursor(), fips, profile, zip_code)
        alerts, nws_source = self._live_alerts(place)
        report_id = f"rpt_{uuid.uuid4().hex[:12]}"
        report["report_id"] = report_id
        report["location"]["tract_geoid"] = place.tract_geoid if place else None
        grid, grid_source = self._grid(report["location"]["load_zone"])
        report["live"] = {"alerts": alerts, "grid": grid}
        report["narrative"] = {"status": "pending", "url": f"/v1/report/{report_id}/narrative"}
        report["sources"] = [*report["sources"], census_source, nws_source, grid_source]
        report = Report.model_validate(report).model_dump(mode="json")
        self._reports.put(report_id, report)
        return report

    def areas(self, layer: str) -> list[dict]:
        """County rows for a map layer. Only pays_twice is served here; the sales map reads its own files."""
        if layer != "pays_twice":
            raise ValueError("layer must be pays_twice")
        cursor = self._con.cursor()
        tables = {row[0] for row in cursor.execute("show tables").fetchall()}
        if "pays_twice" not in tables:
            raise LookupError("pays_twice is not built; run python -m pipeline.pays_twice")
        frame = cursor.execute("""
            select county_fips, county, load_zone, base_offer, homes, long_outages_per_year,
                   household_long_outages, grid_usd_per_core, home_rank, grid_rank, "index"
            from pays_twice order by "index" desc nulls last
        """).df()
        return [{key: (None if isinstance(value, float) and value != value else value)
                 for key, value in row.items()} for row in frame.to_dict(orient="records")]

    def get(self, report_id: str) -> dict | None:
        return self._reports.get(report_id)

    def narrative(self, report_id: str) -> dict | None:
        """Validated narrative for a stored report, computed once. None when the id is unknown."""
        report = self._reports.get(report_id)
        if report is None:
            return None
        if report["narrative"]["status"] != "pending":
            return report["narrative"]
        call = None if "llm" in self._faults else self._call
        facts = from_contract(report)
        key = hashlib.sha256(json.dumps(facts, sort_keys=True).encode()).hexdigest()
        cached = self._narratives.get(key) if call is not None else None
        if cached is not None:
            result = cached
        else:
            result = narrate(facts, call)
            if call is not None:
                self._record("llm", "ok" if result["status"] != "template" else "degraded")
                if result["status"] != "template":
                    self._narratives.put(key, result)
        narrative = {key: result[key] for key in ("status", "headline", "summary", "fact_ids")}
        narrative["url"] = report["narrative"]["url"]
        llm = {"id": "llm", "status": "ok" if result["status"] != "template" else "degraded"}
        if result["status"] == "template":
            llm["fallback"] = "template"
        updated = {**report, "narrative": narrative,
                   "sources": [s for s in report["sources"] if s["id"] != "llm"] + [llm]}
        self._reports.put(report_id, Report.model_validate(updated).model_dump(mode="json"))
        return narrative
