import json

import pytest
from fastapi.testclient import TestClient

from api.app.adapters import AdapterError, TTLCache
from api.app.adapters.census import Place, address_key, parse_match
from api.app.adapters.nws import parse_alerts
from api.app.main import create_app, narrative_stream
from api.app.metrics import Metrics
from api.app.service import ReportService
from pipeline import settings

PLANO = Place("48085", "48085031675", 33.056, -96.789, "75024", "TX")


def _service(geocode=None, alerts=None) -> ReportService:
    return ReportService(
        settings.FEATURES_DUCKDB, None, Metrics(),
        geocode=geocode or (lambda address: PLANO),
        alerts=alerts or (lambda lat, lon: [{"event": "Heat Advisory", "severity": "Moderate",
                                              "headline": "Heat Advisory", "ends": None}]),
    )


@pytest.fixture
def client(monkeypatch) -> TestClient:
    monkeypatch.setenv("PORCHLIGHT_DEBUG", "1")
    return TestClient(create_app(_service()))


def test_address_report_has_live_fields_and_sources(client):
    response = client.post("/v1/report", json={"address": "123 Main St, Plano, TX 75024", "heat": "electric"})
    assert response.status_code == 200
    report = response.json()
    assert report["location"]["county"] == "Collin"
    assert report["location"]["tract_geoid"] == "48085031675"
    assert report["sizing"]["cores"] == 2
    assert report["live"]["alerts"][0]["event"] == "Heat Advisory"
    assert {s["id"]: s["status"] for s in report["sources"]}["nws"] == "ok"
    assert report["narrative"] == {"status": "pending", "headline": None, "summary": None, "fact_ids": [],
                                   "url": f"/v1/report/{report['report_id']}/narrative"}


def test_the_address_is_not_kept_in_the_report(client):
    report = client.post("/v1/report", json={"address": "123 Main St, Plano, TX 75024"}).json()
    assert "Main St" not in json.dumps(report)


def test_county_request_without_address_skips_census_and_nws(client):
    report = client.post("/v1/report", json={"county_fips": "48167"}).json()
    sources = {s["id"]: s["status"] for s in report["sources"]}
    assert sources["census"] == "not_connected" and sources["nws"] == "unavailable"
    assert report["sizing"]["cores"] is None


def test_request_needs_a_place_and_texas():
    client = TestClient(create_app(_service(geocode=lambda a: Place("06001", None, 37.8, -122.2, None, "CA"))))
    assert client.post("/v1/report", json={"heat": "gas"}).status_code == 422
    assert client.post("/v1/report", json={"county_fips": "06001"}).status_code == 422
    outside = client.post("/v1/report", json={"address": "1 Main St, Oakland, CA"})
    assert outside.status_code == 422 and "Texas" in outside.json()["detail"]


def test_geocoder_failure_falls_back_to_county_or_asks_again():
    def broken(address):
        raise AdapterError("down")

    client = TestClient(create_app(_service(geocode=broken)))
    missing = client.post("/v1/report", json={"address": "123 Main St, Plano, TX"})
    assert missing.status_code == 422
    fallback = client.post("/v1/report", json={"address": "123 Main St, Plano, TX", "county_fips": "48085"}).json()
    assert {s["id"]: s["status"] for s in fallback["sources"]}["census"] == "degraded"


def test_faults_degrade_nws_and_llm_but_the_report_renders(client):
    client.post("/v1/debug/faults", json={"nws": True, "llm": True})
    report = client.post("/v1/report", json={"address": "123 Main St, Plano, TX 75024"}).json()
    assert {s["id"]: s["status"] for s in report["sources"]}["nws"] == "degraded"
    narrative = client.get(f"/v1/report/{report['report_id']}/narrative.json").json()
    assert narrative["status"] == "template" and narrative["summary"]
    stored = client.get(f"/v1/report/{report['report_id']}").json()
    assert stored["sources"][-1] == {"id": "llm", "status": "degraded", "as_of": None, "fallback": "template"}


def test_fault_switch_is_hidden_without_debug(monkeypatch):
    monkeypatch.delenv("PORCHLIGHT_DEBUG", raising=False)
    client = TestClient(create_app(_service()))
    assert client.post("/v1/debug/faults", json={"nws": True}).status_code == 404


def test_narrative_streams_as_server_sent_events(client):
    report = client.post("/v1/report", json={"county_fips": "48201"}).json()
    body = client.get(f"/v1/report/{report['report_id']}/narrative").text
    assert body.startswith("event: status\n")
    assert "event: done" in body


def test_unknown_report_is_404(client):
    assert client.get("/v1/report/rpt_missing").status_code == 404
    assert client.get("/v1/report/rpt_missing/narrative").status_code == 404


def test_metrics_count_requests(client):
    client.get("/health")
    text = client.get("/metrics").text
    assert 'porchlight_requests_total{method="GET",route="/health",status="200"} 1' in text


def test_stream_order():
    events = list(narrative_stream({"status": "ok", "headline": "H", "summary": "a b", "fact_ids": ["x"]}))
    assert [e.split("\n")[0] for e in events] == ["event: status", "event: headline", "event: token",
                                                  "event: token", "event: done"]


def test_census_parse_and_key():
    payload = {"result": {"addressMatches": [{
        "coordinates": {"x": -96.8, "y": 33.0}, "addressComponents": {"zip": "75024", "state": "TX"},
        "geographies": {"Counties": [{"GEOID": "48085"}], "Census Tracts": [{"GEOID": "48085031675"}]},
    }]}}
    assert parse_match(payload) == Place("48085", "48085031675", 33.0, -96.8, "75024", "TX")
    with pytest.raises(AdapterError):
        parse_match({"result": {"addressMatches": []}})
    assert address_key("1 Main  St") == address_key("1 main st") and "main" not in address_key("1 main st")


def test_nws_parse():
    alerts = parse_alerts({"features": [{"properties": {"event": "Flood Watch", "severity": "Severe",
                                                        "headline": "h", "expires": "2026-09-27T00:00:00-05:00"}}]})
    assert alerts == [{"event": "Flood Watch", "severity": "Severe", "headline": "h",
                       "ends": "2026-09-27T00:00:00-05:00"}]


def test_ttl_cache_expires_and_evicts():
    now = [0.0]
    cache: TTLCache[int] = TTLCache(ttl_s=10, max_items=2, clock=lambda: now[0])
    cache.put("a", 1)
    cache.put("b", 2)
    cache.put("c", 3)
    assert cache.get("a") is None and cache.get("c") == 3
    now[0] = 11
    assert cache.get("c") is None
