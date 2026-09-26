"""National Weather Service active alerts for a point. Cached briefly; alerts change within minutes."""
from __future__ import annotations

import httpx

from api.app.adapters import AdapterError, TTLCache

URL = "https://api.weather.gov/alerts/active"
TIMEOUT_S = 3.0
# NWS asks every client to identify itself.
HEADERS = {"User-Agent": "Porchlight (Base Power x AITX hackathon)", "Accept": "application/geo+json"}

_cache: TTLCache[list[dict]] = TTLCache(ttl_s=300)
# One pooled client for the process; httpx clients are thread-safe.
_http = httpx.Client(timeout=TIMEOUT_S)


def parse_alerts(payload: dict) -> list[dict]:
    alerts = []
    for feature in payload.get("features", []):
        props = feature.get("properties", {})
        alerts.append({
            "event": props.get("event"),
            "severity": props.get("severity"),
            "headline": props.get("headline"),
            "ends": props.get("ends") or props.get("expires"),
        })
    return alerts


def active_alerts(latitude: float, longitude: float, client: httpx.Client | None = None) -> list[dict]:
    key = f"{latitude:.3f},{longitude:.3f}"
    cached = _cache.get(key)
    if cached is not None:
        return cached
    try:
        http = client or _http
        response = http.get(URL, params={"point": key}, headers=HEADERS, timeout=TIMEOUT_S)
        response.raise_for_status()
        alerts = parse_alerts(response.json())
    except (httpx.HTTPError, ValueError) as error:
        raise AdapterError(f"NWS alerts failed: {type(error).__name__}") from error
    _cache.put(key, alerts)
    return alerts
