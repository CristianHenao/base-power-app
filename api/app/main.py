"""Porchlight API. Run: uvicorn api.app.main:app --port 8000   (needs the `api` extra and data/features.duckdb)

Routes follow the playbook contract (A-02). Addresses are only passed to the Census
geocoder; they are never logged or stored.
"""
from __future__ import annotations

import json
import os
import time
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from pydantic import BaseModel

from api.app.adapters.ercot import SnapshotWorker
from api.app.events import EventStore, FunnelEvent, event_store
from api.app.metrics import Metrics
from api.app.narrator.narrate import ModelCall
from api.app.narrator.xai import KEY_ENV, xai_call
from api.app.schemas import Narrative, Report, ReportRequest
from api.app.service import PlaceNotFound, ReportService
from pipeline import settings

DEBUG_ENV = "PORCHLIGHT_DEBUG"
CORS_ENV = "PORCHLIGHT_CORS_ORIGINS"
DEFAULT_ORIGINS = "http://localhost:3000"


class Faults(BaseModel):
    census: bool = False
    nws: bool = False
    llm: bool = False
    ercot: bool = False


def default_call() -> ModelCall | None:
    return xai_call() if os.environ.get(KEY_ENV) else None


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def narrative_stream(narrative: dict) -> Iterator[str]:
    """Only validated text streams: the whole narrative is checked before the first token."""
    yield sse("status", {"status": narrative["status"]})
    yield sse("headline", {"text": narrative["headline"]})
    for word in (narrative["summary"] or "").split(" "):
        yield sse("token", {"text": word + " "})
    yield sse("done", {"status": narrative["status"], "fact_ids": narrative["fact_ids"]})


def create_app(service: ReportService | None = None, metrics: Metrics | None = None,
               events: EventStore | None = None) -> FastAPI:
    metrics = metrics or Metrics()
    events = events or event_store(os.environ.get("DATABASE_URL"))
    service = service or ReportService(settings.FEATURES_DUCKDB, default_call(), metrics, grid=SnapshotWorker())

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if service.grid is not None:
            service.grid.start()
        yield
        if service.grid is not None:
            service.grid.stop()

    app = FastAPI(title="Porchlight API", version="1.0.0", lifespan=lifespan,
                  description="Will my lights stay on? County outage history, storm replays and Core sizing for Texas.")
    origins = [o.strip() for o in os.environ.get(CORS_ENV, DEFAULT_ORIGINS).split(",") if o.strip()]
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET", "POST"], allow_headers=["*"])

    @app.middleware("http")
    async def time_requests(request: Request, call_next):
        started = time.perf_counter()
        response = await call_next(request)
        route = request.scope.get("route")
        metrics.observe(request.method, getattr(route, "path", "unmatched"), response.status_code,
                        time.perf_counter() - started)
        return response

    @app.get("/health")
    @app.get("/healthz")
    def health() -> dict:
        return {"status": "ok", "service": "api", "features": settings.FEATURES_DUCKDB.name,
                "faults": sorted(service.faults)}

    @app.get("/metrics", response_class=PlainTextResponse)
    def prometheus() -> str:
        return metrics.render()

    @app.post("/v1/report", response_model=Report)
    def create_report(body: ReportRequest) -> dict:
        try:
            return service.create(body)
        except PlaceNotFound as error:
            raise HTTPException(status_code=422, detail=str(error)) from None
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from None

    @app.post("/v1/events", status_code=202)
    def record_event(body: FunnelEvent) -> dict:
        events.add(body)
        return {"accepted": True}

    @app.get("/v1/events/summary")
    def event_summary() -> dict:
        return {"counts": events.counts(), "store": type(events).__name__}

    @app.get("/v1/grid/now")
    def grid_now() -> dict:
        if service.grid is None:
            raise HTTPException(status_code=503, detail="grid snapshot is not running")
        snapshot, status = service.grid.current()
        if snapshot is None:
            raise HTTPException(status_code=503, detail="no ERCOT snapshot yet")
        return {**snapshot, "source_status": status}

    @app.get("/v1/areas")
    def areas(layer: str) -> dict:
        try:
            rows = service.areas(layer)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from None
        except LookupError as error:
            raise HTTPException(status_code=503, detail=str(error)) from None
        return {"layer": layer, "counties": rows,
                "note": "Grid value is a perfect-foresight upper bound per Core; homeowner value is an estimate."}

    @app.get("/v1/report/{report_id}", response_model=Report)
    def read_report(report_id: str) -> dict:
        report = service.get(report_id)
        if report is None:
            raise HTTPException(status_code=404, detail="report not found or expired")
        return report

    @app.get("/v1/report/{report_id}/narrative")
    def stream_narrative(report_id: str) -> StreamingResponse:
        narrative = service.narrative(report_id)
        if narrative is None:
            raise HTTPException(status_code=404, detail="report not found or expired")
        return StreamingResponse(narrative_stream(narrative), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache"})

    @app.get("/v1/report/{report_id}/narrative.json", response_model=Narrative)
    def narrative_json(report_id: str) -> dict:
        narrative = service.narrative(report_id)
        if narrative is None:
            raise HTTPException(status_code=404, detail="report not found or expired")
        return narrative

    @app.post("/v1/debug/faults")
    def set_faults(body: Faults) -> JSONResponse:
        if os.environ.get(DEBUG_ENV) != "1":
            raise HTTPException(status_code=404, detail="not found")
        service.set_faults({name for name, on in body.model_dump().items() if on})
        return JSONResponse({"faults": sorted(service.faults)})

    return app


def _app() -> FastAPI:
    if not Path(settings.FEATURES_DUCKDB).exists():
        raise RuntimeError(f"missing {settings.FEATURES_DUCKDB}; run python -m pipeline.features")
    return create_app()


app = _app()
