"""Right size: the smallest Core count covering most of a county's long outage hours."""
from __future__ import annotations

from collections.abc import Iterable

import numpy as np

from api.app.sim.backup import recommend_cores

LONG_OUTAGE_H = 12.0
SIZING_TARGET = 0.9


def long_hours(durations, weights, backup_h: float, min_h: float = LONG_OUTAGE_H) -> tuple[float, float]:
    """(dark hours covered, dark hours) for homes out at least `min_h` in one event."""
    d, w = np.asarray(durations, float), np.asarray(weights, float)
    long = d >= min_h
    total = float((w[long] * d[long]).sum())
    covered = float((w[long] * np.minimum(d[long], backup_h)).sum())
    return covered, total


def covered_share(parts: Iterable[tuple[float, float]]) -> float:
    """Pooled share of long outage hours covered across events. 1.0 when there were none."""
    covered = total = 0.0
    for part_covered, part_total in parts:
        covered += part_covered
        total += part_total
    return 1.0 if total <= 0 else covered / total


def size_cores(shares: dict[int, float], target: float = SIZING_TARGET) -> int:
    return recommend_cores(shares, target=target)


def sizing_reason(cores: int, shares: dict[int, float], county: str, since_year: int,
                  target: float = SIZING_TARGET) -> str:
    """One sentence for the report. Numbers come from `shares`, never from a model."""
    share = shares[cores]
    percent = f"{int(share * 100 + 1e-9)}%"
    count = "One Core" if cores == 1 else f"{_word(cores)} Cores"
    if share >= target:
        lead = f"{count} would have covered {percent} of the 12-hour-plus outage hours in {county} County since {since_year}."
    else:
        lead = (
            f"{count} would have covered {percent} of the 12-hour-plus outage hours in {county} County "
            f"since {since_year}, the most of the options we model."
        )
    return f"{lead} Base confirms sizing at install."


def _word(n: int) -> str:
    return {2: "Two", 3: "Three", 4: "Four"}.get(n, str(n))
