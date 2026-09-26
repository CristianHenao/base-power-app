"""ERCOT's public grid dashboards: conditions, reserves, demand and real-time prices by load zone.

A background thread keeps the last good snapshot (the ERCOT snapshot worker). Reports read
that snapshot and never wait on ERCOT; an old snapshot is served but marked stale.
"""
from __future__ import annotations

import threading
import time
from collections.abc import Callable
from datetime import datetime, timezone

import httpx

from api.app.adapters import AdapterError

BASE = "https://www.ercot.com/api/1/services/read/dashboards"
TIMEOUT_S = 4.0
REFRESH_S = 300.0
STALE_AFTER_S = 900.0
# Dashboard price keys to ERCOT load zone names.
ZONE_KEYS = {
    "lzAen": "LZ_AEN", "lzCps": "LZ_CPS", "lzHouston": "LZ_HOUSTON", "lzLcra": "LZ_LCRA",
    "lzNorth": "LZ_NORTH", "lzRaybn": "LZ_RAYBN", "lzSouth": "LZ_SOUTH", "lzWest": "LZ_WEST",
}

_http = httpx.Client(timeout=TIMEOUT_S, headers={"User-Agent": "Porchlight (Base Power x AITX hackathon)"})


def _get(name: str, client: httpx.Client) -> dict:
    response = client.get(f"{BASE}/{name}.json", timeout=TIMEOUT_S)
    response.raise_for_status()
    return response.json()


def parse_snapshot(prc: dict, prices: dict, supply: dict) -> dict:
    """One snapshot from the three dashboards. Times are kept as ERCOT sends them (Central, with offset)."""
    condition = prc["current_condition"]
    latest_price = prices["rtSppData"][-1]
    actual = [row for row in supply["data"] if not row.get("forecast")]
    latest_load = actual[-1] if actual else {}
    as_of = datetime.fromtimestamp(int(condition["datetime"]), tz=timezone.utc).isoformat()
    return {
        "status": str(condition["state"]),
        "note": condition.get("condition_note"),
        "eea_level": int(condition.get("eea_level", 0)),
        "reserves_mw": float(str(condition["prc_value"]).replace(",", "")),
        "demand_mw": latest_load.get("demand"),
        "capacity_mw": latest_load.get("capacity"),
        "prices_mwh": {zone: float(latest_price[key]) for key, zone in ZONE_KEYS.items() if key in latest_price},
        "price_interval": latest_price.get("timestamp"),
        "as_of": as_of,
    }


def fetch_snapshot(client: httpx.Client | None = None) -> dict:
    http = client or _http
    try:
        return parse_snapshot(_get("daily-prc", http), _get("system-wide-prices", http), _get("supply-demand", http))
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as error:
        raise AdapterError(f"ERCOT dashboards failed: {type(error).__name__}") from error


class SnapshotWorker:
    """Refreshes the snapshot every `refresh_s` seconds and keeps the last good one."""

    def __init__(self, fetch: Callable[[], dict] = fetch_snapshot, refresh_s: float = REFRESH_S,
                 clock: Callable[[], float] = time.monotonic):
        self._fetch = fetch
        self._refresh_s = refresh_s
        self._clock = clock
        self._snapshot: dict | None = None
        self._fetched_at: float | None = None
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def refresh(self) -> bool:
        try:
            snapshot = self._fetch()
        except AdapterError:
            return False
        with self._lock:
            self._snapshot, self._fetched_at = snapshot, self._clock()
        return True

    def current(self) -> tuple[dict | None, str]:
        """The last good snapshot and a source status: ok, degraded (stale) or unavailable."""
        with self._lock:
            if self._snapshot is None or self._fetched_at is None:
                return None, "unavailable"
            stale = self._clock() - self._fetched_at > STALE_AFTER_S
            return {**self._snapshot, "stale": stale}, "degraded" if stale else "ok"

    def start(self) -> None:
        if self._thread is not None:
            return

        def loop() -> None:
            while not self._stop.is_set():
                self.refresh()
                self._stop.wait(self._refresh_s)

        self._thread = threading.Thread(target=loop, name="ercot-snapshot", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
