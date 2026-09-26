"""External services behind timeouts and caches. Each call reports a source status instead of raising into the report."""
from __future__ import annotations

import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from typing import Generic, TypeVar

T = TypeVar("T")


class AdapterError(RuntimeError):
    """The service failed, timed out, or answered with nothing usable."""


class TTLCache(Generic[T]):
    """Small thread-safe LRU cache whose entries expire after `ttl_s` seconds."""

    def __init__(self, ttl_s: float, max_items: int = 1024, clock: Callable[[], float] = time.monotonic):
        self.ttl_s = ttl_s
        self.max_items = max_items
        self._clock = clock
        self._items: OrderedDict[str, tuple[float, T]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> T | None:
        with self._lock:
            hit = self._items.get(key)
            if hit is None:
                return None
            stored_at, value = hit
            if self._clock() - stored_at > self.ttl_s:
                del self._items[key]
                return None
            self._items.move_to_end(key)
            return value

    def put(self, key: str, value: T) -> None:
        with self._lock:
            self._items[key] = (self._clock(), value)
            self._items.move_to_end(key)
            while len(self._items) > self.max_items:
                self._items.popitem(last=False)
