"""Report assembly for the API: place lookup, the offline report, live alerts and the narrative.

Every outside dependency degrades to a source status. Only a missing county (no address
match and no county_fips) stops a report.
"""
from __future__ import annotations

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
from pipeline.reports import build_report

PROFILE_BY_HEAT = {"electric": "RESHIWR", "gas": "RESLOWR"}
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
        grid: SnapshotWorker | None = None,
    ) -> None:
        self.grid = grid
        self._con = duckdb.connect(str(features_path), read_only=True)
        self._call = call
        self._metrics = metrics
        self._geocode = geocode
        self._alerts = alerts
        self._reports: TTLCache[dict] = TTLCache(ttl_s=REPORT_TTL_S, max_items=2048)
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
            return str(request.county_fips), None, {"id": "census", "status": "not_connected"}
        try:
            if "census" in self._faults:
                raise AdapterError("census fault injected")
            place = self._geocode(request.address)
            self._record("census", "ok")
        except AdapterError:
            self._record("census", "degraded")
            if request.county_fips:
                return request.county_fips, None, {"id": "census", "status": "degraded"}
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
        result = narrate(from_contract(report), call)
        if call is not None:
            self._record("llm", "ok" if result["status"] != "template" else "degraded")
        narrative = {key: result[key] for key in ("status", "headline", "summary", "fact_ids")}
        narrative["url"] = report["narrative"]["url"]
        llm = {"id": "llm", "status": "ok" if result["status"] != "template" else "degraded"}
        if result["status"] == "template":
            llm["fallback"] = "template"
        updated = {**report, "narrative": narrative,
                   "sources": [s for s in report["sources"] if s["id"] != "llm"] + [llm]}
        self._reports.put(report_id, Report.model_validate(updated).model_dump(mode="json"))
        return narrative
