"""Deterministic narrative used when the model is off, slow, or fails validation twice."""
from __future__ import annotations

from datetime import datetime

from api.app.narrator.facts import MONTHS

_CORE_WORDS = {1: "one Core", 2: "two Cores", 3: "three Cores"}


def _whole(value: float) -> int:
    return int(round(value))


def template_narrative(report: dict) -> dict:
    county = report["county"]["name"]
    outlook = report["outlook"]
    event = report["events"][0]
    start = datetime.fromisoformat(event["start"])
    one = report["backup"]["hours_by_month"]["cores_1"]
    short = min(range(12), key=lambda m: one[m])
    long = max(range(12), key=lambda m: one[m])
    sizing = report.get("sizing") or {}
    sized = sizing.get("cores") is not None
    if sized:
        cores = int(sizing["cores"])
        share = int(sizing["share"] * 100 + 1e-9)
        core_words = _CORE_WORDS.get(cores, f"{cores} Cores")
        suggestion = [f"We suggest {core_words}.", f"That would have covered {share}% of past long outage hours."]
    else:
        suggestion = []

    headline = f"{outlook['label']} outlook for long outages in {county} County"
    summary = " ".join([
        f"Homes in {county} County lose power for 12 hours or more about once every "
        f"{_whole(outlook['once_every_years'])} years.",
        f"That comes from {_whole(outlook['years_of_data'])} years of records since {outlook['since']}.",
        f"The largest outage here began on {MONTHS[start.month - 1]} {start.day}, {start.year}.",
        *([f"At its peak, {_whole(event['peak_out_pct'])}% of homes in the county were dark."]
          if event.get("peak_out_pct") is not None else []),
        f"For a home with {report['home']['label']} running the whole home, one Core lasts about "
        f"{_whole(one[short])} hours in {MONTHS[short]} and about {_whole(one[long])} hours in {MONTHS[long]}.",
        *suggestion,
        "Those hours are whole-home use. Essentials last longer.",
        "Base confirms sizing at install.",
    ])
    return {
        "headline": headline,
        "summary": summary,
        "fact_ids": [
            "county.name", "home.label", "outlook.label", "threshold.hours",
            "outlook.once_every_years", "outlook.years_of_data", "outlook.since",
            "event.1.start", *(["event.1.peak_out_pct"] if event.get("peak_out_pct") is not None else []),
            "backup.short_month",
            "backup.long_month", *(["sizing.cores", "sizing.share"] if sized else []),
        ],
    }
