"""Reports in the A-02 contract shape, built from data/features.duckdb.

Run: python -m pipeline.reports   (after pipeline.features)

`build_report` works for any Texas county. Storm replays, coverage and the Core
recommendation come from pipeline.features for the demo homes and pipeline.statewide for
everyone else; if those tables are missing, the fields are null and `sizing.reason` says why. Live fields (NWS
alerts, grid status, tract) are filled by the API. `main` writes the three persona
reports to data/processed/reports/{fips}.json for the web app.

Keys beyond the contract: home, outlook.since, outlook.customers_floored, events[].storm,
events[].peak_out, events[].backup_h,
events[].covered_order, sizing.share, backup.surprise (hours from the 20% reserve),
household_gap (expected dark hours a year with 0, 1 or 2 Cores, and per-season survival
curves for the browser's household answer), narrative text.
"""
from __future__ import annotations

import json
import math
import os
import sys
from functools import lru_cache

import duckdb
import pandas as pd
import yaml

from api.app.narrator.facts import from_contract
from api.app.narrator.narrate import ModelCall, narrate
from pipeline import settings
from pipeline.household_gap import GRID_HOURS

MONTHS = (
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
)
CENTRAL = "America/Chicago"
CORES = (1, 2)
DEFAULT_PROFILE = "RESLOWR"
NO_SIZING = ("Core sizing replays every past storm on this home's load, and it is not built for this "
             "address yet; see backup hours by month. Base confirms sizing at install.")


def event_label(storm: object, start_central: pd.Timestamp) -> str:
    """The marquee storm name when Alejandro's storms.yaml names it, else "Month YYYY outage"."""
    if isinstance(storm, str) and storm:
        return storm
    return f"{MONTHS[start_central.month - 1]} {start_central.year} outage"


def _num(value: object, digits: int) -> float | None:
    if value is None:
        return None
    number = float(value)
    return None if math.isnan(number) else round(number, digits)


def event_record(row: pd.Series, order: str = settings.LONG_OUTAGE_ORDER, floored: bool = False) -> dict:
    """One contract event. Duration pairs are [rotate, stay]; `covered` uses `order`, null without a replay.

    In a county whose customer count is floored at its peak outage, the share out is not
    meaningful (the biggest event reads 100% by construction), so it is null.
    """
    start = pd.Timestamp(row["start"]).tz_convert(CENTRAL)
    replayed = "backup_h_1" in row.index
    return {
        "id": row["id"],
        "label": event_label(row.get("storm"), start),
        "storm": row.get("storm") if isinstance(row.get("storm"), str) else None,
        "start": start.isoformat(),
        "peak_out": int(row["peak_out"]),
        "peak_out_pct": None if floored else _num(row["peak_out_pct"], 1),
        "duration_h": {
            "p50": [_num(row["p50_h_rotate"], 1), _num(row["p50_h_stay"], 1)],
            "p90": [_num(row["p90_h_rotate"], 1), _num(row["p90_h_stay"], 1)],
        },
        "covered": None if not replayed else {
            f"cores_{n}": {
                "homes": _num(row[f"covered_{order}_{n}_homes"], 3),
                "hours": _num(row[f"covered_{order}_{n}_hours"], 3),
            }
            for n in CORES
        },
        "covered_order": order if replayed else None,
        "backup_h": None if not replayed else {f"cores_{n}": _num(row[f"backup_h_{n}"], 1) for n in CORES},
    }


def mode_hours(monthly: pd.DataFrame, mode: str, where: str) -> dict[str, list[float]]:
    """cores_1 and cores_2 hour lists, January first, for one backup mode."""
    part = monthly.loc[monthly["mode"] == mode].sort_values(["cores", "month"])
    hours = {f"cores_{n}": [round(float(h), 1) for h in part.loc[part["cores"] == n, "hours"]] for n in CORES}
    if any(len(values) != 12 for values in hours.values()):
        raise ValueError(f"backup hours for {where} have no 12 {mode} months per Core count")
    return hours


@lru_cache(maxsize=1)
def base_offers(path: str = str(settings.BASE_AVAILABILITY_YAML)) -> tuple[dict[int, dict], str]:
    """Base offer by EIA utility id, and the file's as-of date."""
    data = yaml.safe_load(open(path).read())
    offers = {int(row["eia_utility_id"]): row for row in data["utilities"] if row.get("eia_utility_id")}
    return offers, str(data.get("as_of", ""))


def base_offer(utility_id: int | None) -> dict:
    offers, _ = base_offers()
    row = offers.get(int(utility_id)) if utility_id is not None else None
    if row is None:
        return {"product": "none", "url": None}
    return {"product": row["offer"], "url": row.get("url")}


def zip_utility(con: duckdb.DuckDBPyConnection, zip_code: str | None) -> tuple[int, str] | None:
    """The ZIP's wires utility when the ZIP lists exactly one."""
    if not zip_code or not settings.ZIP_UTILITY_CSV.exists():
        return None
    rows = con.execute(
        "select utility_id, utility_name, candidates from read_csv_auto(?, types={'zip': 'VARCHAR'}) where zip = ?",
        [str(settings.ZIP_UTILITY_CSV), zip_code],
    ).fetchall()
    if len(rows) != 1 or int(rows[0][2]) != 1:
        return None
    return int(rows[0][0]), str(rows[0][1])


def household_gap(con: duckdb.DuckDBPyConnection, fips: str, profile: str, tables: set[str]) -> dict | None:
    """Typical-home backup gap plus the per-season ingredients the browser needs for a household answer."""
    if not {"household_gap", "household_gap_seasons"} <= tables:
        return None
    row = con.execute("select * from household_gap where county_fips = ? and profile_type = ?", [fips, profile]).df()
    seasons = con.execute("select seasons from household_gap_seasons where county_fips = ?", [fips]).fetchone()
    if row.empty or seasons is None:
        return None
    r = row.iloc[0]
    lo, hi = json.loads(r["interval_scale"])
    return {
        "typical_home": {
            "dark_hours": {"none": round(float(r["dark_hours_0"]), 2),
                           "one_core": round(float(r["dark_hours_1_full"]), 2),
                           "two_cores": round(float(r["dark_hours_2_full"]), 2),
                           "one_core_reserve": round(float(r["dark_hours_1_reserve"]), 2),
                           "two_cores_reserve": round(float(r["dark_hours_2_reserve"]), 2)},
            "gap_chance": {"one_core": round(float(r["gap_chance_1_full"]), 4),
                           "two_cores": round(float(r["gap_chance_2_full"]), 4)},
            "interval_scale": [lo, hi],
        },
        "hours_grid": [float(h) for h in GRID_HOURS],
        "seasons": json.loads(seasons[0]),
    }


def is_persona(fips: str, profile_type: str) -> bool:
    return settings.DEMO_PROFILE.get(fips) == profile_type


def build_report(con: duckdb.DuckDBPyConnection, fips: str, profile_type: str | None = None,
                 zip_code: str | None = None) -> dict:
    """Contract report for one county and home type, without the narrative or live fields."""
    info = con.execute("select * from county_info where county_fips = ?", [fips]).df()
    if info.empty:
        raise ValueError(f"{fips} is not a Texas county in county_info")
    info_row = info.iloc[0]
    outlook = con.execute("select * from outlook where county_fips = ?", [fips]).df()
    if outlook.empty:
        raise ValueError(f"no outlook row for {fips}")
    row = outlook.iloc[0]
    profile = profile_type or settings.DEMO_PROFILE.get(fips, DEFAULT_PROFILE)
    if profile not in settings.HOME_LABELS:
        raise ValueError(f"unknown profile type {profile}")
    persona = is_persona(fips, profile)
    floored = bool(row.get("customers_floored", False))

    tables = {r[0] for r in con.execute("show tables").fetchall()}
    statewide = not persona and {"event_replays_texas", "sizing_texas"} <= tables
    if persona:
        events = con.execute("select * from events where county_fips = ? order by customer_hours desc limit ?",
                             [fips, settings.REPORT_EVENTS]).df()
    elif statewide:
        events = con.execute("""
            select e.*, r.* exclude (id, county_fips, profile_type)
            from events_texas e left join event_replays_texas r on r.id = e.id and r.profile_type = ?
            where e.county_fips = ? order by e.customer_hours desc limit ?
        """, [profile, fips, settings.REPORT_EVENTS]).df()
    else:
        events = con.execute("select * from events_texas where county_fips = ? order by customer_hours desc limit ?",
                             [fips, settings.REPORT_EVENTS]).df()
    if persona:
        monthly = con.execute(
            "select mode, cores, month, hours from backup_monthly where county_fips = ?", [fips]).df()
    else:
        monthly = con.execute(
            "select mode, cores, month, hours from backup_zone_monthly where weather_zone = ? and profile_type = ?",
            [info_row["weather_zone"], profile]).df()
    assumptions = dict(con.execute("select name, value from assumptions").fetchall())
    data_end = con.execute('select max("end") from events_texas').fetchone()[0]

    by_zip = zip_utility(con, zip_code)
    utility_id = by_zip[0] if by_zip else (None if pd.isna(info_row["utility_id"]) else int(info_row["utility_id"]))
    utility_name = by_zip[1] if by_zip else (None if pd.isna(info_row["utility_name"]) else str(info_row["utility_name"]))
    _, offers_as_of = base_offers()

    sizing_rows = pd.DataFrame()
    if persona:
        sizing_rows = con.execute("select * from sizing where county_fips = ?", [fips]).df()
    elif statewide:
        sizing_rows = con.execute("select * from sizing_texas where county_fips = ? and profile_type = ?",
                                  [fips, profile]).df()
    if sizing_rows.empty:
        sizing = {"cores": None, "reason": NO_SIZING, "share": None}
    else:
        sizing_row = sizing_rows.iloc[0]
        cores = int(sizing_row["cores"])
        sizing = {"cores": cores, "reason": sizing_row["reason"],
                  "share": round(float(sizing_row[f"{sizing_row['order']}_share_{cores}"]), 3)}

    return {
        "report_id": f"rpt_{fips}_{profile.lower()}",
        "location": {
            "county_fips": fips, "county": str(info_row["county"]), "tract_geoid": None,
            "weather_zone": str(info_row["weather_zone"]),
            "load_zone": None if pd.isna(info_row["load_zone"]) else str(info_row["load_zone"]),
            "utility": {"name": utility_name, "eia_utility_id": utility_id,
                        "detected_from": "zip" if by_zip else "county", "confirmed": False},
        },
        "home": {"profile_type": profile, "label": settings.HOME_LABELS[profile]},
        "base_offer": base_offer(utility_id),
        "outlook": {
            "level": int(row["level"]), "label": row["label"],
            "long_outages_per_year": round(float(row["long_outages_per_year"]), 3),
            "interval_90": [round(float(row["lo90"]), 3), round(float(row["hi90"]), 3)],
            "once_every_years": round(float(row["once_every_years"]), 1),
            "years_of_data": round(float(row["years_of_data"]), 1),
            "since": int(settings.RATES_START[:4]),
            "customers_floored": floored,
        },
        "events": [event_record(event, floored=floored) for _, event in events.iterrows()],
        "backup": {
            "hours_by_month": mode_hours(monthly, "normal", fips),
            "assumptions": {
                "kwh_per_core": assumptions["kwh_per_core"], "kw_per_core": assumptions["kw_per_core"],
                "start_soc": assumptions["start_soc"], "mode": "normal",
                "profile_year": int(assumptions["backup_profile_year"]),
            },
            "surprise": {"start_soc": assumptions["reserve_soc"],
                         "hours_by_month": mode_hours(monthly, "surprise", fips)},
        },
        "sizing": sizing,
        "household_gap": household_gap(con, fips, profile, tables),
        "live": {"alerts": [], "grid": None},
        "narrative": None,
        "sources": [
            {"id": "eaglei", "as_of": pd.Timestamp(data_end).tz_convert(CENTRAL).date().isoformat(), "status": "ok"},
            {"id": "ercot_profiles", "as_of": str(int(assumptions["backup_profile_year"])), "status": "ok"},
            {"id": "base_offer", "as_of": offers_as_of, "status": "ok"},
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


def model_call() -> ModelCall | None:
    """The Grok call when XAI_API_KEY is set (environment or the repo's .env), else None."""
    from api.app.narrator.xai import KEY_ENV, xai_call
    from evals.record import load_env

    load_env(settings.ENV_FILE)
    return xai_call() if os.environ.get(KEY_ENV) else None


def main() -> int:
    if not settings.FEATURES_DUCKDB.exists():
        print(f"missing {settings.FEATURES_DUCKDB}; run python -m pipeline.features first")
        return 1
    call = model_call()
    settings.REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    with duckdb.connect(str(settings.FEATURES_DUCKDB), read_only=True) as con:
        for fips in settings.DEMO_FIPS:
            report = with_narrative(build_report(con, fips), call)
            (settings.REPORTS_DIR / f"{fips}.json").write_text(json.dumps(report, indent=2) + "\n")
            print(f"{report['location']['county']:<7} {report['outlook']['label']:<9} "
                  f"{report['sizing']['cores']} Cores  {report['base_offer']['product']}  "
                  f"narrative {report['narrative']['status']}: {report['narrative']['headline']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
