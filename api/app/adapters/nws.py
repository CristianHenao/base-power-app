"""National Weather Service active alerts for a point. Cached briefly; alerts change within minutes."""
from __future__ import annotations

import json
import random
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone

URL = "https://api.weather.gov/alerts/active"
TIMEOUT_S = 3.0
# NWS asks every client to identify itself.
HEADERS = {"User-Agent": "Porchlight (Base Power x AITX hackathon)", "Accept": "application/geo+json"}
USER_AGENT = HEADERS["User-Agent"]
CACHE_TTL_S = 300.0
SEVERITY = {"extreme": "extreme", "severe": "severe", "moderate": "moderate", "minor": "minor", "unknown": "unknown"}

# (url, headers, timeout seconds) -> (status code, body).
Get = Callable[[str, dict[str, str], float], tuple[int, bytes]]
Clock = Callable[[], float]
Sleep = Callable[[float], None]


@dataclass
class AlertResult:
    status: str
    alerts: list[dict] = field(default_factory=list)
    as_of: str | None = None


@dataclass
class _Entry:
    stored_at: float
    result: AlertResult


class AlertCache:
    """Last successful lookup per rounded point. Fresh for five minutes."""

    def __init__(self, ttl_s: float = CACHE_TTL_S) -> None:
        self.ttl_s = ttl_s
        self._entries: dict[str, _Entry] = {}

    def fresh(self, key: str, now: float) -> AlertResult | None:
        entry = self._entries.get(key)
        if entry is None or now - entry.stored_at >= self.ttl_s:
            return None
        return entry.result

    def stale(self, key: str) -> AlertResult | None:
        entry = self._entries.get(key)
        return None if entry is None else entry.result

    def store(self, key: str, now: float, result: AlertResult) -> None:
        self._entries[key] = _Entry(now, result)


def _urllib_get(url: str, headers: dict[str, str], timeout_s: float) -> tuple[int, bytes]:
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout_s) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()


def _point_key(lat: float, lon: float) -> str:
    if not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise ValueError("point must be latitude, longitude in range")
    return f"{lat:.4f},{lon:.4f}"


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _alert(feature: dict) -> dict | None:
    props = feature.get("properties") or {}
    if props.get("status") != "Actual" or props.get("messageType") not in ("Alert", "Update"):
        return None
    event = props.get("event")
    if not isinstance(event, str) or not event.strip():
        return None
    severity = str(props.get("severity") or "Unknown").lower()
    return {
        "id": str(feature.get("id") or props.get("id") or event),
        "event": event,
        "headline": props.get("headline") or event,
        "severity": SEVERITY.get(severity, "unknown"),
        "sent": props.get("sent"),
        "expires": props.get("expires"),
        "ends": props.get("ends"),
    }


def parse_alerts(body: bytes) -> list[dict]:
    payload = json.loads(body)
    features = payload.get("features")
    if not isinstance(features, list):
        raise ValueError("NWS response has no features list")
    return [alert for feature in features if (alert := _alert(feature)) is not None]


def _copy(result: AlertResult, status: str) -> AlertResult:
    return AlertResult(status, [dict(alert) for alert in result.alerts], result.as_of)


def active_alerts(
    lat: float,
    lon: float,
    *,
    cache: AlertCache | None = None,
    get: Get = _urllib_get,
    now: Clock = time.monotonic,
    sleep: Sleep = time.sleep,
    clock: Callable[[], str] = _utc_now,
    timeout_s: float = TIMEOUT_S,
) -> AlertResult:
    """Active alerts at one point. Upstream failure returns a result, never raises."""
    key = _point_key(lat, lon)
    store = cache if cache is not None else _default_cache
    moment = now()
    cached = store.fresh(key, moment)
    if cached is not None:
        return _copy(cached, "ok")

    headers = dict(HEADERS)
    url = f"{URL}?point={key}"
    last_status = 0
    for attempt in range(2):
        try:
            status, body = get(url, headers, timeout_s)
            last_status = status
            if status == 200:
                result = AlertResult("ok", parse_alerts(body), clock())
                store.store(key, moment, result)
                return _copy(result, "ok")
            if status < 500:
                break
        except (TimeoutError, urllib.error.URLError, ValueError, json.JSONDecodeError):
            last_status = 0
        if attempt == 0 and (last_status == 0 or last_status >= 500):
            sleep(random.uniform(0, 0.05))
            continue
        break

    stale = store.stale(key)
    if stale is not None:
        return _copy(stale, "degraded")
    return AlertResult("unavailable", [], None)


def attach_alerts(report: dict, result: AlertResult) -> dict:
    """Fill live.alerts and the nws source. Other report fields stay as they were."""
    source: dict = {"id": "nws", "status": result.status}
    if result.as_of is not None:
        source["as_of"] = result.as_of
    if result.status == "degraded":
        source["fallback"] = "cache"
    sources = [item for item in report.get("sources", []) if item.get("id") != "nws"]
    live = {**(report.get("live") or {}), "alerts": result.alerts}
    return {**report, "live": live, "sources": [*sources, source]}


_default_cache = AlertCache()
