"""National Weather Service active alerts for a point.

Design from Victor's nws-adapter branch: fresh results are cached for five minutes; a timeout
or 5xx is retried once; if both tries fail, the last good alerts for that point are served and
the report marks the source degraded with a cache fallback, instead of showing no alerts.
"""
from __future__ import annotations

import httpx

from api.app.adapters import AdapterError, TTLCache

URL = "https://api.weather.gov/alerts/active"
TIMEOUT_S = 1.5
RETRIES = 1
LAST_GOOD_S = 6 * 3600
# NWS asks every client to identify itself.
HEADERS = {"User-Agent": "Porchlight (Base Power x AITX hackathon)", "Accept": "application/geo+json"}

_cache: TTLCache[list[dict]] = TTLCache(ttl_s=300)
_last_good: TTLCache[list[dict]] = TTLCache(ttl_s=LAST_GOOD_S)
# One pooled client for the process; httpx clients are thread-safe.
_http = httpx.Client(timeout=TIMEOUT_S)


def point_key(latitude: float, longitude: float) -> str:
    return f"{latitude:.3f},{longitude:.3f}"


def parse_alerts(payload: dict) -> list[dict]:
    """Live alerts only (Victor's filter): status Actual, message Alert or Update, with an event name.

    NWS also publishes test messages, exercises and cancellations; those are not shown.
    """
    alerts = []
    for feature in payload.get("features", []):
        props = feature.get("properties") or {}
        if props.get("status", "Actual") != "Actual" or props.get("messageType", "Alert") not in ("Alert", "Update"):
            continue
        if not isinstance(props.get("event"), str) or not props["event"].strip():
            continue
        alerts.append({
            "event": props.get("event"),
            "severity": props.get("severity"),
            "headline": props.get("headline"),
            "ends": props.get("ends") or props.get("expires"),
        })
    return alerts


def _fetch(key: str, client: httpx.Client) -> list[dict]:
    last_error: Exception | None = None
    for _ in range(RETRIES + 1):
        try:
            response = client.get(URL, params={"point": key}, headers=HEADERS, timeout=TIMEOUT_S)
            if response.status_code >= 500:
                last_error = httpx.HTTPStatusError("NWS 5xx", request=response.request, response=response)
                continue
            response.raise_for_status()
            return parse_alerts(response.json())
        except (httpx.TimeoutException, httpx.TransportError) as error:
            last_error = error
        except (httpx.HTTPStatusError, ValueError) as error:
            raise AdapterError(f"NWS alerts failed: {type(error).__name__}") from error
    raise AdapterError(f"NWS alerts failed after a retry: {type(last_error).__name__}") from last_error


def active_alerts(latitude: float, longitude: float, client: httpx.Client | None = None) -> list[dict]:
    """Fresh alerts for the point (cached five minutes). Raises AdapterError when NWS is down."""
    key = point_key(latitude, longitude)
    cached = _cache.get(key)
    if cached is not None:
        return cached
    alerts = _fetch(key, client or _http)
    _cache.put(key, alerts)
    _last_good.put(key, alerts)
    return alerts


def last_good_alerts(latitude: float, longitude: float) -> list[dict] | None:
    """The last alerts NWS returned for this point within six hours, for when it is down."""
    return _last_good.get(point_key(latitude, longitude))
