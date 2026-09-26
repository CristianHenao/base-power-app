"""Funnel events: which reports were viewed, which replays opened, which Base links clicked.

Stored in Postgres when DATABASE_URL is set (compose), in memory otherwise. Events carry a
report id and county only: no address, no household details.
"""
from __future__ import annotations

import threading
from collections import Counter
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

EventName = Literal["report_viewed", "replay_opened", "cta_clicked"]


class FunnelEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: EventName
    report_id: str | None = Field(default=None, pattern=r"^rpt_[0-9a-f]{12}$")
    county_fips: str | None = Field(default=None, pattern=r"^48\d{3}$")


class EventStore(Protocol):
    def add(self, event: FunnelEvent) -> None: ...

    def counts(self) -> dict[str, int]: ...


class MemoryStore:
    def __init__(self) -> None:
        self._counts: Counter[str] = Counter()
        self._lock = threading.Lock()

    def add(self, event: FunnelEvent) -> None:
        with self._lock:
            self._counts[event.name] += 1

    def counts(self) -> dict[str, int]:
        with self._lock:
            return dict(self._counts)


class PostgresStore:
    SCHEMA = """
        create table if not exists funnel_events (
            id bigserial primary key,
            name text not null,
            report_id text,
            county_fips text,
            created_at timestamptz not null default now()
        )
    """

    def __init__(self, url: str) -> None:
        import psycopg

        self._url = url
        self._connect = psycopg.connect
        with self._connect(url, autocommit=True) as con:
            con.execute(self.SCHEMA)

    def add(self, event: FunnelEvent) -> None:
        with self._connect(self._url, autocommit=True) as con:
            con.execute("insert into funnel_events (name, report_id, county_fips) values (%s, %s, %s)",
                        (event.name, event.report_id, event.county_fips))

    def counts(self) -> dict[str, int]:
        with self._connect(self._url) as con:
            rows = con.execute("select name, count(*) from funnel_events group by name").fetchall()
        return {name: int(count) for name, count in rows}


def event_store(database_url: str | None) -> EventStore:
    """Postgres when configured and reachable; memory otherwise, so a missing database never breaks the API."""
    if not database_url:
        return MemoryStore()
    try:
        return PostgresStore(database_url)
    except Exception:  # noqa: BLE001 - any connection failure falls back to memory
        return MemoryStore()
