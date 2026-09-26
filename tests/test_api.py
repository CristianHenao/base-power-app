import json

import httpx
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
    assert report["sizing"]["cores"] in (1, 2)  # statewide replay covers every county


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


def _dashboards() -> tuple[dict, dict, dict]:
    prc = {"current_condition": {"state": "normal", "condition_note": "Enough power.", "eea_level": 0,
                                 "prc_value": "19,226", "datetime": 1790451384}}
    prices = {"rtSppData": [{"lzHouston": 25.0, "timestamp": "a"},
                            {"lzHouston": 30.17, "lzNorth": 26.45, "timestamp": "2026-09-26 14:30:00-0500"}]}
    supply = {"data": [{"demand": 60000, "capacity": 87000, "forecast": 0},
                       {"demand": 61773, "capacity": 87325, "forecast": 0},
                       {"demand": 65000, "capacity": 90000, "forecast": 1}]}
    return prc, prices, supply


def test_ercot_snapshot_parses_the_latest_rows():
    from api.app.adapters.ercot import parse_snapshot

    snap = parse_snapshot(*_dashboards())
    assert snap["reserves_mw"] == 19226.0
    assert snap["demand_mw"] == 61773
    assert snap["prices_mwh"] == {"LZ_HOUSTON": 30.17, "LZ_NORTH": 26.45}


def test_snapshot_worker_keeps_the_last_good_snapshot_and_marks_it_stale():
    from api.app.adapters.ercot import STALE_AFTER_S, SnapshotWorker, parse_snapshot

    now = [0.0]
    answers = [parse_snapshot(*_dashboards())]

    def fetch():
        if answers:
            return answers.pop()
        raise AdapterError("down")

    worker = SnapshotWorker(fetch=fetch, clock=lambda: now[0])
    assert worker.current() == (None, "unavailable")
    assert worker.refresh() and not worker.refresh()
    snap, status = worker.current()
    assert status == "ok" and snap["stale"] is False
    now[0] = STALE_AFTER_S + 1
    snap, status = worker.current()
    assert status == "degraded" and snap["stale"] is True


def test_report_carries_the_grid_for_its_load_zone(monkeypatch):
    from api.app.adapters.ercot import SnapshotWorker, parse_snapshot

    monkeypatch.setenv("PORCHLIGHT_DEBUG", "1")
    worker = SnapshotWorker(fetch=lambda: parse_snapshot(*_dashboards()))
    worker.refresh()
    service = ReportService(settings.FEATURES_DUCKDB, None, Metrics(), geocode=lambda a: PLANO,
                            alerts=lambda lat, lon: [], grid=worker)
    worker.start = lambda: None  # no background thread in tests
    client = TestClient(create_app(service))
    report = client.post("/v1/report", json={"county_fips": "48201"}).json()
    assert report["live"]["grid"]["load_zone"] == "LZ_HOUSTON"
    assert report["live"]["grid"]["price_mwh"] == 30.17
    assert {s["id"]: s["status"] for s in report["sources"]}["ercot_live"] == "ok"
    assert client.get("/v1/grid/now").json()["prices_mwh"]["LZ_NORTH"] == 26.45
    client.post("/v1/debug/faults", json={"ercot": True})
    report = client.post("/v1/report", json={"county_fips": "48201"}).json()
    assert report["live"]["grid"] is None
    assert {s["id"]: s["status"] for s in report["sources"]}["ercot_live"] == "degraded"


def test_areas_serves_pays_twice_rows(client):
    body = client.get("/v1/areas", params={"layer": "pays_twice"}).json()
    assert body["layer"] == "pays_twice" and len(body["counties"]) == 254
    scored = [row["index"] for row in body["counties"] if row["index"] is not None]
    assert body["counties"][0]["index"] == max(scored)
    assert body["counties"][-1]["index"] is None  # counties outside ERCOT sort last
    assert client.get("/v1/areas", params={"layer": "flood"}).status_code == 422


def test_funnel_events_are_counted_without_personal_data():
    from api.app.events import MemoryStore

    client = TestClient(create_app(_service(), events=MemoryStore()))
    assert client.post("/v1/events", json={"name": "report_viewed", "report_id": "rpt_0123456789ab",
                                           "county_fips": "48201"}).status_code == 202
    client.post("/v1/events", json={"name": "cta_clicked"})
    assert client.get("/v1/events/summary").json() == {"counts": {"report_viewed": 1, "cta_clicked": 1},
                                                       "store": "MemoryStore"}
    assert client.post("/v1/events", json={"name": "report_viewed", "address": "1 Main St"}).status_code == 422
    assert client.post("/v1/events", json={"name": "signed_up"}).status_code == 422


def test_event_store_falls_back_to_memory_without_a_database():
    from api.app.events import MemoryStore, event_store

    assert isinstance(event_store(None), MemoryStore)
    assert isinstance(event_store("postgres://nobody:nothing@127.0.0.1:1/none"), MemoryStore)


def test_unmatched_street_falls_back_to_the_zip_county():
    from api.app.service import zip_in

    def no_match(address):
        raise AdapterError("no match")

    service = ReportService(settings.FEATURES_DUCKDB, None, Metrics(), geocode=no_match,
                            alerts=lambda lat, lon: [], zip_counties={"75025": "48085"},
                            centroids={"48085": (33.19, -96.57)})
    client = TestClient(create_app(service))
    report = client.post("/v1/report", json={"address": "1200 Juniper Hollow Ln, Plano, TX 75025"}).json()
    assert report["location"]["county"] == "Collin" and report["location"]["tract_geoid"] is None
    sources = {s["id"]: s["status"] for s in report["sources"]}
    assert sources["census"] == "degraded" and sources["nws"] == "ok"
    assert zip_in("Houston TX 77084-1234") == "77084" and zip_in("Oakland CA 94612") is None


def test_geocoder_misses_are_cached(monkeypatch):
    from api.app.adapters import census

    calls = []

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"result": {"addressMatches": []}}

    class Client:
        def get(self, *args, **kwargs):
            calls.append(1)
            return Response()

    address = "1 Nowhere Lane, Plano, TX 75025 (cache test)"
    for _ in range(2):
        with pytest.raises(AdapterError):
            census.geocode(address, client=Client())
    assert len(calls) == 1


def test_identical_facts_reuse_the_validated_narrative():
    replies = []

    def call(system, user, timeout_s):
        replies.append(1)
        return json.dumps({"headline": "Long outages in Harris County", "fact_ids": ["county.name"],
                           "summary": "Homes in Harris County. Base confirms sizing at install."})

    service = ReportService(settings.FEATURES_DUCKDB, call, Metrics(), geocode=lambda a: PLANO, alerts=lambda la, lo: [])
    client = TestClient(create_app(service))
    for _ in range(2):
        rid = client.post("/v1/report", json={"county_fips": "48201"}).json()["report_id"]
        assert client.get(f"/v1/report/{rid}/narrative.json").json()["status"] == "ok"
    assert len(replies) == 1


def test_nws_retries_once_then_raises():
    from api.app.adapters import nws

    calls = []

    class Flaky:
        def get(self, *args, **kwargs):
            calls.append(1)
            raise httpx.ConnectTimeout("slow")

    with pytest.raises(AdapterError, match="after a retry"):
        nws.active_alerts(10.001, -10.001, client=Flaky())
    assert len(calls) == 2


def test_nws_outage_serves_the_last_good_alerts():
    def down(lat, lon):
        raise AdapterError("NWS down")

    service = ReportService(settings.FEATURES_DUCKDB, None, Metrics(), geocode=lambda a: PLANO, alerts=down,
                            last_good_alerts=lambda lat, lon: [{"event": "Flood Watch", "severity": "Moderate",
                                                                "headline": "Flood Watch", "ends": None}])
    report = TestClient(create_app(service)).post("/v1/report", json={"address": "123 Main St, Plano, TX 75024"}).json()
    assert report["live"]["alerts"][0]["event"] == "Flood Watch"
    nws_source = next(s for s in report["sources"] if s["id"] == "nws")
    assert nws_source["status"] == "degraded" and nws_source["fallback"] == "cache"


def test_nws_keeps_only_live_alerts():
    feature = lambda **props: {"properties": {"event": "Flood Watch", "severity": "Moderate", **props}}  # noqa: E731
    payload = {"features": [
        feature(status="Actual", messageType="Alert"),
        feature(status="Actual", messageType="Update", event="Heat Advisory"),
        feature(status="Test", messageType="Alert"),
        feature(status="Actual", messageType="Cancel"),
        feature(status="Actual", messageType="Alert", event="  "),
    ]}
    assert [a["event"] for a in parse_alerts(payload)] == ["Flood Watch", "Heat Advisory"]
    assert parse_alerts({"features": []}) == []
