"""Grid Risk Index: one standardized 1-100 score per county and per utility.

Every layer is already a 0-1 percentile rank against Texas counties. The index averages
them in two equal halves, so six hazard layers can't drown out the grid:

    hazard exposure = mean rank of flood, tornado, hail and wind, hurricane, winter freeze, extreme heat
    grid stress     = mean rank of long outages, price spikes (ERCOT only) and summer peak demand
    raw             = mean of the two halves that have data

A county's raw score is re-ranked across Texas counties to 1-100 (ties share a value). A
utility's raw score is the mean of its counties' raw scores weighted by its own estimated
customers in each (county_weights), re-ranked across utilities. Missing layers are left out of
their half, never counted as zero; `sources` says how many of the nine were used. Market size
(potential homes), local generation and the FEMA composite are context, not risk, and stay out.

Bands are fifths of the index: Low, Moderate, Elevated, High, Severe.
"""
from __future__ import annotations

import math
from collections.abc import Sequence

HAZARD_LAYERS = ["flood", "tornado", "severe_storm", "hurricane", "winter", "heat"]
STRESS_LAYERS = ["outages", "price_spikes", "peak_demand"]
RISK_LAYERS = HAZARD_LAYERS + STRESS_LAYERS
BANDS = ["Low", "Moderate", "Elevated", "High", "Severe"]


def percentile_1_100(values: Sequence[float | None]) -> list[int | None]:
    """Rank each value among the present ones (ties take their average rank) and map to 1-100."""
    present = sorted(v for v in values if v is not None)
    n = len(present)
    out: list[int | None] = []
    for value in values:
        if value is None:
            out.append(None)
            continue
        if n == 1:
            out.append(50)
            continue
        below = sum(1 for v in present if v < value)
        equal = sum(1 for v in present if v == value)
        average_rank = below + (equal + 1) / 2  # 1-based
        out.append(1 + math.floor(99 * (average_rank - 1) / (n - 1) + 0.5))
    return out


def band(index: int) -> tuple[int, str]:
    level = min(5, (index - 1) // 20 + 1)
    return level, BANDS[level - 1]


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _halves(ranks: dict) -> tuple[float | None, float | None, int]:
    hazard = [ranks[l] for l in HAZARD_LAYERS if ranks.get(l) is not None]
    stress = [ranks[l] for l in STRESS_LAYERS if ranks.get(l) is not None]
    return _mean(hazard), _mean(stress), len(hazard) + len(stress)


def _weighted(items: list[tuple[float | None, float]]) -> float | None:
    known = [(v, w) for v, w in items if v is not None and w > 0]
    total = sum(w for _, w in known)
    return sum(v * w for v, w in known) / total if total > 0 else None


def _finish(records: list[dict], raws: list[float | None], hazards: list[float | None],
            stresses: list[float | None], sources: list[int]) -> None:
    index, hazard_pct, stress_pct = percentile_1_100(raws), percentile_1_100(hazards), percentile_1_100(stresses)
    scored = sorted((r for r in raws if r is not None), reverse=True)
    for i, record in enumerate(records):
        raw = raws[i]
        level, label = band(index[i]) if index[i] is not None else (None, None)
        record["risk"] = {
            "index": index[i],
            "level": level,
            "band": label,
            "rank": None if raw is None else 1 + sum(1 for r in scored if r > raw),
            "of": len(scored),
            "hazard": hazard_pct[i],
            "stress": stress_pct[i],
            "raw": None if raw is None else round(raw, 6),
            "sources": sources[i],
            "sources_total": len(RISK_LAYERS),
        }


def attach_risk_index(release: dict) -> dict:
    """Add `risk` to every county and utility in a release dict (mutates and returns it)."""
    counties = release["counties"]
    halves = {c["fips"]: _halves(c["ranks"]) for c in counties}
    raw = {f: _mean([h for h in (hz, st) if h is not None]) for f, (hz, st, _) in halves.items()}
    _finish(
        counties,
        [raw[c["fips"]] for c in counties],
        [halves[c["fips"]][0] for c in counties],
        [halves[c["fips"]][1] for c in counties],
        [halves[c["fips"]][2] for c in counties],
    )

    utilities = release["utilities"]
    by_fips = {c["fips"]: c for c in counties}
    u_raw, u_hazard, u_stress, u_sources = [], [], [], []
    for utility in utilities:
        weights = [(w["fips"], w["customers_est"]) for w in utility["county_weights"] if w["fips"] in by_fips]
        u_raw.append(_weighted([(raw[f], w) for f, w in weights]))
        u_hazard.append(_weighted([(halves[f][0], w) for f, w in weights]))
        u_stress.append(_weighted([(halves[f][1], w) for f, w in weights]))
        u_sources.append(sum(
            1 for layer in RISK_LAYERS if any(by_fips[f]["ranks"].get(layer) is not None for f, _ in weights)
        ))
    _finish(utilities, u_raw, u_hazard, u_stress, u_sources)
    return release
