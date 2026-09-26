"""US Census geocoder: one-line address to county FIPS, tract and coordinates. No key needed."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass

import httpx

from api.app.adapters import AdapterError, TTLCache

URL = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress"
TIMEOUT_S = 4.0
PARAMS = {"benchmark": "Public_AR_Current", "vintage": "Current_Current", "format": "json",
          "layers": "Counties,Census Tracts"}


@dataclass(frozen=True)
class Place:
    county_fips: str
    tract_geoid: str | None
    latitude: float
    longitude: float
    zip_code: str | None
    state: str | None


_cache: TTLCache[Place] = TTLCache(ttl_s=24 * 3600)
# One pooled client for the process; httpx clients are thread-safe.
_http = httpx.Client(timeout=TIMEOUT_S)


def address_key(address: str) -> str:
    """Cache key that never keeps the address itself."""
    return hashlib.sha256(" ".join(address.lower().split()).encode()).hexdigest()


def parse_match(payload: dict) -> Place:
    matches = payload.get("result", {}).get("addressMatches", [])
    if not matches:
        raise AdapterError("the Census geocoder found no match for this address")
    match = matches[0]
    geographies = match.get("geographies", {})
    counties = geographies.get("Counties", [])
    if not counties:
        raise AdapterError("the Census match has no county")
    tracts = geographies.get("Census Tracts", [])
    components = match.get("addressComponents", {})
    return Place(
        county_fips=str(counties[0]["GEOID"]).zfill(5),
        tract_geoid=str(tracts[0]["GEOID"]) if tracts else None,
        latitude=float(match["coordinates"]["y"]),
        longitude=float(match["coordinates"]["x"]),
        zip_code=components.get("zip"),
        state=components.get("state"),
    )


def geocode(address: str, client: httpx.Client | None = None) -> Place:
    key = address_key(address)
    cached = _cache.get(key)
    if cached is not None:
        return cached
    try:
        http = client or _http
        response = http.get(URL, params={**PARAMS, "address": address}, timeout=TIMEOUT_S)
        response.raise_for_status()
        place = parse_match(response.json())
    except (httpx.HTTPError, ValueError, KeyError) as error:
        raise AdapterError(f"Census geocoder failed: {type(error).__name__}") from error
    _cache.put(key, place)
    return place
