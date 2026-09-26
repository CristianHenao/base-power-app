"""Prometheus text metrics without a client library: request latency by route and adapter outcomes."""
from __future__ import annotations

import threading
from collections import defaultdict

BUCKETS_S = (0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)


class Metrics:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._counts: dict[tuple[str, str, int], int] = defaultdict(int)
        self._buckets: dict[str, list[int]] = defaultdict(lambda: [0] * len(BUCKETS_S))
        self._sums: dict[str, float] = defaultdict(float)
        self._totals: dict[str, int] = defaultdict(int)
        self._adapters: dict[tuple[str, str], int] = defaultdict(int)

    def observe(self, method: str, route: str, status: int, seconds: float) -> None:
        with self._lock:
            self._counts[(method, route, status)] += 1
            for i, edge in enumerate(BUCKETS_S):
                if seconds <= edge:
                    self._buckets[route][i] += 1
            self._sums[route] += seconds
            self._totals[route] += 1

    def adapter(self, name: str, status: str) -> None:
        with self._lock:
            self._adapters[(name, status)] += 1

    def render(self) -> str:
        lines = ["# TYPE porchlight_requests_total counter"]
        with self._lock:
            for (method, route, status), count in sorted(self._counts.items()):
                lines.append(f'porchlight_requests_total{{method="{method}",route="{route}",status="{status}"}} {count}')
            lines.append("# TYPE porchlight_request_seconds histogram")
            for route in sorted(self._totals):
                for edge, count in zip(BUCKETS_S, self._buckets[route], strict=True):
                    lines.append(f'porchlight_request_seconds_bucket{{route="{route}",le="{edge}"}} {count}')
                lines.append(f'porchlight_request_seconds_bucket{{route="{route}",le="+Inf"}} {self._totals[route]}')
                lines.append(f'porchlight_request_seconds_sum{{route="{route}"}} {self._sums[route]:.6f}')
                lines.append(f'porchlight_request_seconds_count{{route="{route}"}} {self._totals[route]}')
            lines.append("# TYPE porchlight_adapter_calls_total counter")
            for (name, status), count in sorted(self._adapters.items()):
                lines.append(f'porchlight_adapter_calls_total{{adapter="{name}",status="{status}"}} {count}')
        return "\n".join(lines) + "\n"
