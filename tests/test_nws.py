import json

import pytest

from api.app.adapters.nws import TIMEOUT_S, USER_AGENT, AlertCache, active_alerts, attach_alerts


def _feature(event: str, message_type: str = "Alert", status: str = "Actual", **props) -> dict:
    return {
        "id": f"https://api.weather.gov/alerts/{event}",
        "properties": {"event": event, "headline": f"{event} issued", "severity": "Severe",
                       "status": status, "messageType": message_type, "sent": "2026-09-26T18:00:00Z",
                       "expires": "2026-09-26T19:00:00Z", "ends": "2026-09-26T18:45:00Z", **props},
    }


def _body(*features: dict) -> bytes:
    return json.dumps({"features": list(features)}).encode()


def test_active_alerts_keep_actual_updates_and_send_a_user_agent():
    seen = {}

    def get(url, headers, timeout_s):
        seen.update(url=url, headers=headers, timeout=timeout_s)
        return 200, _body(
            _feature("Severe Thunderstorm Warning"),
            _feature("Heat Advisory", message_type="Update", severity="Moderate"),
            _feature("Test Warning", status="Test"),
            _feature("Cancelled Warning", message_type="Cancel"),
        )

    result = active_alerts(29.7604, -95.3698, cache=AlertCache(), get=get, now=lambda: 0, sleep=lambda _s: None)
    assert seen["headers"]["User-Agent"] == USER_AGENT
    assert seen["headers"]["Accept"] == "application/geo+json"
    assert seen["url"].endswith("point=29.7604,-95.3698")
    assert seen["timeout"] == TIMEOUT_S
    assert result.status == "ok"
    assert [alert["event"] for alert in result.alerts] == ["Severe Thunderstorm Warning", "Heat Advisory"]
    assert result.alerts[1]["severity"] == "moderate"


def test_no_alerts_is_a_successful_empty_list():
    result = active_alerts(30.0, -97.0, cache=AlertCache(), get=lambda *_a: (200, _body()), now=lambda: 0, sleep=lambda _s: None)
    assert result.status == "ok"
    assert result.alerts == []
    assert result.as_of is not None


def test_five_xx_retries_once_then_uses_the_cached_alert():
    cache = AlertCache(ttl_s=300)
    calls = {"n": 0}

    def get(url, headers, timeout_s):
        calls["n"] += 1
        if calls["n"] == 1:
            return 200, _body(_feature("Tornado Warning"))
        return 503, b""

    clock = {"t": 0.0}
    first = active_alerts(30.0, -97.0, cache=cache, get=get, now=lambda: clock["t"], sleep=lambda _s: None)
    assert first.status == "ok"
    clock["t"] = 10
    cached = active_alerts(30.0, -97.0, cache=cache, get=get, now=lambda: clock["t"], sleep=lambda _s: None)
    assert cached.status == "ok"
    assert calls["n"] == 1
    clock["t"] = 301
    stale = active_alerts(30.0, -97.0, cache=cache, get=get, now=lambda: clock["t"], sleep=lambda _s: None)
    assert stale.status == "degraded"
    assert stale.alerts[0]["event"] == "Tornado Warning"
    assert calls["n"] == 3


def test_repeated_five_xx_without_a_cache_does_not_raise():
    calls = {"n": 0}

    def get(url, headers, timeout_s):
        calls["n"] += 1
        raise TimeoutError("slow")

    result = active_alerts(30.0, -97.0, cache=AlertCache(), get=get, now=lambda: 0, sleep=lambda _s: None)
    assert result.status == "unavailable"
    assert result.alerts == []
    assert calls["n"] == 2


def test_client_error_is_not_retried():
    calls = {"n": 0}

    def get(url, headers, timeout_s):
        calls["n"] += 1
        return 400, b""

    result = active_alerts(30.0, -97.0, cache=AlertCache(), get=get, now=lambda: 0, sleep=lambda _s: None)
    assert result.status == "unavailable"
    assert calls["n"] == 1


def test_attach_alerts_replaces_only_the_nws_source():
    report = {"live": {"alerts": [], "grid": None}, "sources": [{"id": "eaglei", "status": "ok"}, {"id": "nws", "status": "not_connected"}]}
    updated = attach_alerts(report, active_alerts(30.0, -97.0, cache=AlertCache(), get=lambda *_a: (200, _body()), now=lambda: 0, sleep=lambda _s: None))
    assert updated["live"]["grid"] is None
    assert updated["live"]["alerts"] == []
    assert updated["sources"][0] == {"id": "eaglei", "status": "ok"}
    assert updated["sources"][1]["id"] == "nws"
    assert updated["sources"][1]["status"] == "ok"


def test_point_out_of_range_is_a_caller_error():
    with pytest.raises(ValueError):
        active_alerts(120, 0, cache=AlertCache(), get=lambda *_a: (200, _body()), now=lambda: 0, sleep=lambda _s: None)
