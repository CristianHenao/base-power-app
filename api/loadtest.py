"""Load test the running API and print a latency table.

Run: python -m api.loadtest --url http://localhost:8000 --requests 300 --concurrency 20

Scenarios hit what the report page does: a county report (no outside calls), a repeat
address (Census and NWS cached) and a stored narrative. The first address call warms the
caches and is not counted.
"""
from __future__ import annotations

import argparse
import asyncio
import statistics
import sys
import time
from collections.abc import Awaitable, Callable

import httpx

COUNTIES = ("48085", "48201", "48453", "48029", "48113", "48439")
ADDRESS = {"address": "1600 Smith St, Houston, TX 77002", "heat": "gas"}


def percentile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return float("nan")
    k = (len(ordered) - 1) * q
    lo, hi = int(k), min(int(k) + 1, len(ordered) - 1)
    return ordered[lo] + (ordered[hi] - ordered[lo]) * (k - lo)


async def run(n: int, concurrency: int, request: Callable[[int], Awaitable[httpx.Response]]) -> dict:
    latencies: list[float] = []
    errors = 0
    gate = asyncio.Semaphore(concurrency)

    async def one(i: int) -> None:
        nonlocal errors
        async with gate:
            started = time.perf_counter()
            try:
                response = await request(i)
                ok = response.status_code == 200
            except httpx.HTTPError:
                ok = False
            latencies.append(time.perf_counter() - started)
            errors += 0 if ok else 1

    started = time.perf_counter()
    await asyncio.gather(*(one(i) for i in range(n)))
    wall = time.perf_counter() - started
    return {"n": n, "errors": errors, "rps": n / wall, "p50": percentile(latencies, 0.5),
            "p95": percentile(latencies, 0.95), "p99": percentile(latencies, 0.99),
            "mean": statistics.fmean(latencies)}


async def main_async(url: str, n: int, concurrency: int) -> list[tuple[str, dict]]:
    async with httpx.AsyncClient(base_url=url, timeout=30.0) as client:
        warm = await client.post("/v1/report", json=ADDRESS)
        warm.raise_for_status()
        report_id = warm.json()["report_id"]
        (await client.get(f"/v1/report/{report_id}/narrative.json")).raise_for_status()
        scenarios = {
            "POST /v1/report (county)": lambda i: client.post(
                "/v1/report", json={"county_fips": COUNTIES[i % len(COUNTIES)]}),
            "POST /v1/report (address, cached)": lambda i: client.post("/v1/report", json=ADDRESS),
            "GET narrative (stored)": lambda i: client.get(f"/v1/report/{report_id}/narrative.json"),
        }
        return [(name, await run(n, concurrency, request)) for name, request in scenarios.items()]


def table(results: list[tuple[str, dict]], concurrency: int) -> str:
    lines = [f"| Scenario ({concurrency} concurrent) | Requests | Errors | p50 ms | p95 ms | p99 ms | req/s |",
             "|---|---|---|---|---|---|---|"]
    for name, r in results:
        lines.append(f"| {name} | {r['n']} | {r['errors']} | {r['p50'] * 1000:.0f} | {r['p95'] * 1000:.0f} | "
                     f"{r['p99'] * 1000:.0f} | {r['rps']:.0f} |")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--url", default="http://localhost:8000")
    parser.add_argument("--requests", type=int, default=300)
    parser.add_argument("--concurrency", type=int, default=20)
    args = parser.parse_args()
    results = asyncio.run(main_async(args.url, args.requests, args.concurrency))
    print(table(results, args.concurrency))
    return 0 if all(r["errors"] == 0 for _, r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
