"""Facts the narrator may state, each with an id and the numbers it allows.

The model never calculates. Every number in a summary has to come from one of
these facts, after rounding, and the fact has to be cited.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime

MONTHS = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)


@dataclass(frozen=True)
class Fact:
    id: str
    text: str
    numbers: tuple[float, ...] = ()


def allowed(value: float, decimals: tuple[int, ...] = (0, 1)) -> tuple[float, ...]:
    """Rounded forms a sentence may use, plus the floor so 89.9% can read as 89%."""
    forms = {round(value, d) for d in decimals}
    forms.add(float(math.floor(value)))
    return tuple(sorted(forms))


def _percent(share: float) -> float:
    return share * 100.0


def _whole(value: float) -> str:
    return f"{int(round(value))}"


def _date_text(iso: str) -> tuple[str, tuple[float, ...]]:
    stamp = datetime.fromisoformat(iso)
    return f"{MONTHS[stamp.month - 1]} {stamp.day}, {stamp.year}", (float(stamp.day), float(stamp.year))


def build_facts(report: dict) -> list[Fact]:
    """Facts from one report. Times in `events[].start` are Central, ISO 8601."""
    county = report["county"]["name"]
    outlook = report["outlook"]
    facts = [
        Fact("county.name", f"{county} County"),
        Fact("home.label", report["home"]["label"]),
        Fact("outlook.label", outlook["label"]),
        Fact(
            "outlook.once_every_years",
            f"about once every {_whole(outlook['once_every_years'])} years",
            allowed(outlook["once_every_years"]),
        ),
        Fact("outlook.years_of_data", f"{_whole(outlook['years_of_data'])} years of records",
             allowed(outlook["years_of_data"], (0,))),
        Fact("outlook.since", str(outlook["since"]), (float(outlook["since"]),)),
    ]

    for rank, event in enumerate(report["events"][:2], start=1):
        date, date_numbers = _date_text(event["start"])
        key = f"event.{rank}"
        facts += [
            Fact(f"{key}.start", date, date_numbers),
            Fact(f"{key}.peak_out_pct", f"{_whole(event['peak_out_pct'])}% of homes in the county",
                 allowed(event["peak_out_pct"])),
            Fact(f"{key}.p90_hours", f"about {_whole(event['duration_h']['p90'][1])} hours for the longest-waiting tenth",
                 allowed(event["duration_h"]["p90"][1])),
        ]

    hours = report["backup"]["hours_by_month"]
    one = hours["cores_1"]
    short = min(range(12), key=lambda m: one[m])
    long = max(range(12), key=lambda m: one[m])
    facts += [
        Fact("backup.short_month", f"about {_whole(one[short])} hours on one Core in {MONTHS[short]}",
             allowed(one[short])),
        Fact("backup.long_month", f"about {_whole(one[long])} hours on one Core in {MONTHS[long]}",
             allowed(one[long])),
        Fact("backup.short_month_two_cores", f"about {_whole(hours['cores_2'][short])} hours on two Cores in {MONTHS[short]}",
             allowed(hours["cores_2"][short])),
    ]

    sizing = report["sizing"]
    facts += [
        Fact("sizing.cores", f"{sizing['cores']} Core" + ("" if sizing["cores"] == 1 else "s"),
             (float(sizing["cores"]),)),
        Fact("sizing.share", f"{int(_percent(sizing['share']) + 1e-9)}% of past 12-hour-plus outage hours",
             allowed(_percent(sizing["share"]))),
        Fact("threshold.hours", "12 hours or longer", (12.0,)),
    ]
    return facts
