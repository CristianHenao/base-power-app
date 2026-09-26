"""Persona reports in the A-02 contract shape, built from data/features.duckdb.

Run: python -m pipeline.reports   (after pipeline.features)

Writes data/processed/reports/{fips}.json for the three demo counties so the web
app can build on real numbers before /v1/report is served. `build_report` is the
function the API can call per request. Fields the offline pipeline cannot know
(tract, live alerts, grid status, Base offer) are null with a source status saying why.
Keys beyond the contract: home, outlook.since, events[].backup_h, events[].covered_order,
sizing.share, narrative text.
"""
from __future__ import annotations

import json
import math
import os
import sys
from datetime import date

import duckdb
import pandas as pd

from api.app.narrator.facts import from_contract
from api.app.narrator.narrate import ModelCall, narrate
from pipeline import settings

MONTHS = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)
CENTRAL = "America/Chicago"
CORES = (1, 2)


def storm_label(start_central: date, labels: tuple[tuple[str, str, str], ...] = settings.STORM_LABELS) -> str:
    """Named storm when the Central start date falls in a known window, else "Month YYYY outage"."""
    for first, last, name in labels:
        if date.fromisoformat(first) <= start_central <= date.fromisoformat(last):
            return name
    return f"{MONTHS[start_central.month - 1]} {start_central.year} outage"


def _num(value: float, digits: int) -> float | None:
    value = float(value)
    return None if math.isnan(value) else round(value, digits)


def event_record(row: pd.Series, order: str = settings.LONG_OUTAGE_ORDER) -> dict:
    """One contract event. Duration pairs are [fifo, lifo]; `covered` uses `order`."""
    start = pd.Timestamp(row["start"]).tz_convert(CENTRAL)
    return {
        "id": row["id"],
        "label": storm_label(start.date()),
        "start": start.isoformat(),
        "peak_out_pct": _num(row["peak_out_pct"], 1),
        "duration_h": {
            "p50": [_num(row["p50_h_fifo"], 1), _num(row["p50_h_lifo"], 1)],
            "p90": [_num(row["p90_h_fifo"], 1), _num(row["p90_h_lifo"], 1)],
        },
        "covered": {
            f"cores_{n}": {
                "homes": _num(row[f"covered_{order}_{n}_homes"], 3),
                "hours": _num(row[f"covered_{order}_{n}_hours"], 3),
            }
            for n in CORES
        },
        "covered_order": order,
        "backup_h": {f"cores_{n}": _num(row[f"backup_h_{n}"], 1) for n in CORES},
    }


def build_report(con: duckdb.DuckDBPyConnection, fips: str, zones: pd.Series) -> dict:
    """Contract report for one demo county, without the narrative."""
    if fips not in settings.DEMO_COUNTIES:
        raise ValueError(f"{fips} is not a demo county; per-home tables exist only for {settings.DEMO_FIPS}")
    outlook = con.execute("select * from outlook where county_fips = ?", [fips]).df()
    if outlook.empty:
        raise ValueError(f"no outlook row for {fips}")
    row = outlook.iloc[0]
    events = con.execute(
        "select * from events where county_fips = ? order by customer_hours desc limit ?",
        [fips, settings.REPORT_EVENTS],
    ).df()
    monthly = con.execute(
        "select cores, month, hours from backup_monthly where county_fips = ? and mode = 'normal' order by cores, month",
        [fips],
    ).df()
    sizing = con.execute("select * from sizing where county_fips = ?", [fips]).df().iloc[0]
    assumptions = dict(con.execute("select name, value from assumptions").fetchall())
    data_end = con.execute("select max(\"end\") from events").fetchone()[0]

    profile = settings.DEMO_PROFILE[fips]
    hours = {f"cores_{n}": [round(float(h), 1) for h in monthly.loc[monthly["cores"] == n, "hours"]] for n in CORES}
    if any(len(values) != 12 for values in hours.values()):
        raise ValueError(f"backup_monthly for {fips} is not 12 months per Core count")
    return {
        "report_id": f"rpt_{fips}_{profile.lower()}",
        "location": {
            "county_fips": fips, "county": settings.DEMO_COUNTIES[fips], "tract_geoid": None,
            "weather_zone": str(zones[fips]), "load_zone": settings.DEMO_LOAD_ZONE[fips],
            "utility": {"name": settings.DEMO_UTILITY[fips], "detected_from": "persona", "confirmed": False},
        },
        "home": {"profile_type": profile, "label": settings.HOME_LABELS[profile]},
        "base_offer": None,
        "outlook": {
            "level": int(row["level"]), "label": row["label"],
            "long_outages_per_year": round(float(row["long_outages_per_year"]), 3),
            "interval_90": [round(float(row["lo90"]), 3), round(float(row["hi90"]), 3)],
            "once_every_years": round(float(row["once_every_years"]), 1),
            "years_of_data": round(float(row["years_of_data"]), 1),
            "since": int(settings.RATES_START[:4]),
        },
        "events": [event_record(event) for _, event in events.iterrows()],
        "backup": {
            "hours_by_month": hours,
            "assumptions": {
                "kwh_per_core": assumptions["kwh_per_core"], "kw_per_core": assumptions["kw_per_core"],
                "start_soc": assumptions["start_soc"], "mode": "normal",
                "profile_year": int(assumptions["backup_profile_year"]),
            },
        },
        "sizing": {"cores": int(sizing["cores"]), "reason": sizing["reason"],
                   "share": round(float(sizing[f"{sizing['order']}_share_{int(sizing['cores'])}"]), 3)},
        "live": {"alerts": [], "grid": None},
        "narrative": None,
        "sources": [
            {"id": "eaglei", "as_of": pd.Timestamp(data_end).tz_convert(CENTRAL).date().isoformat(), "status": "ok"},
            {"id": "ercot_profiles", "as_of": str(int(assumptions["backup_profile_year"])), "status": "ok"},
            {"id": "nws", "status": "not_connected"},
            {"id": "base_offer", "status": "not_connected"},
        ],
    }


def with_narrative(report: dict, call: ModelCall | None) -> dict:
    """Attach a validated narrative and its llm source status."""
    result = narrate(from_contract(report), call)
    narrative = {key: result[key] for key in ("status", "headline", "summary", "fact_ids")}
    llm = {"id": "llm", "status": "ok" if result["status"] != "template" else "degraded"}
    if result["status"] == "template":
        llm["fallback"] = "template"
    return {**report, "narrative": {**narrative, "url": None}, "sources": [*report["sources"], llm]}


def _model_call() -> ModelCall | None:
    from api.app.narrator.xai import KEY_ENV, xai_call
    from evals.record import load_env

    load_env(settings.ENV_FILE)
    return xai_call() if os.environ.get(KEY_ENV) else None


def main() -> int:
    if not settings.FEATURES_DUCKDB.exists():
        print(f"missing {settings.FEATURES_DUCKDB}; run python -m pipeline.features first")
        return 1
    crosswalk = pd.read_csv(settings.COUNTY_WEATHER_ZONE_CSV, dtype={"county_fips": "string"})
    zones = crosswalk.set_index(crosswalk["county_fips"].str.zfill(5))["weather_zone"]
    call = _model_call()
    settings.REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    with duckdb.connect(str(settings.FEATURES_DUCKDB), read_only=True) as con:
        for fips in settings.DEMO_FIPS:
            report = with_narrative(build_report(con, fips, zones), call)
            (settings.REPORTS_DIR / f"{fips}.json").write_text(json.dumps(report, indent=2) + "\n")
            print(f"{report['location']['county']:<7} {report['outlook']['label']:<9} "
                  f"{report['sizing']['cores']} Cores  narrative {report['narrative']['status']}: "
                  f"{report['narrative']['headline']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
