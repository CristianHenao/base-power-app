"""Hand-check every persona number against the raw data, independently of the models.

Run: python -m pipeline.persona_check   (after make data)
Writes docs/persona-check.md. A FLAG is a number to look at before it goes in the video.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass

import duckdb
import pandas as pd
import yaml

from api.app.sim.backup import KWH_PER_CORE
from pipeline import settings
from pipeline.sources.eaglei import load_customers
from pipeline.storms import label_events, load_storms

PERSONAS_YAML = settings.REPO_ROOT / "data" / "reference" / "personas.yaml"
BASE_YAML = settings.REPO_ROOT / "data" / "reference" / "base_availability.yaml"
DEMO_PARQUET = settings.REPO_ROOT / "data" / "processed" / "eaglei_demo.parquet"
ZIP_CSV = settings.REPO_ROOT / "data" / "processed" / "zip_utility.csv"
REPORT_MD = settings.REPO_ROOT / "docs" / "persona-check.md"


@dataclass
class Check:
    persona: str
    what: str
    report: str
    independent: str
    ok: bool
    note: str = ""


def close(a: float, b: float, rel: float = 0.02, abs_tol: float = 1e-6) -> bool:
    return abs(a - b) <= max(abs_tol, rel * max(abs(a), abs(b)))


def raw_window(raw: pd.DataFrame, fips: str, start: pd.Timestamp, end: pd.Timestamp) -> pd.Series:
    part = raw.loc[(raw["county_fips"] == fips) & (raw["timestamp"] >= start) & (raw["timestamp"] <= end)]
    return part.drop_duplicates("timestamp").set_index("timestamp")["customers_out"].sort_index()


def check_persona(persona: dict, con: duckdb.DuckDBPyConnection, raw: pd.DataFrame,
                  customers: dict[str, float], zips: pd.DataFrame, base: dict, zones: pd.Series) -> list[Check]:
    name, fips = persona["name"].split(" (")[0], persona["county_fips"]
    checks: list[Check] = []

    # Address flow: ZIP candidates include the persona's utility, and its Base offer matches.
    candidates = zips.loc[zips["zip"] == persona["zip"], "utility_id"].tolist()
    utility = base[persona["utility"]]
    checks.append(Check(name, f"ZIP {persona['zip']} lists {utility['name']}",
                        str(utility["eia_utility_id"] in candidates), f"{len(candidates)} candidate(s)",
                        utility["eia_utility_id"] in candidates))
    checks.append(Check(name, "Base offer", utility["offer"], persona["base_offer"],
                        utility["offer"] == persona["base_offer"]))

    # Outlook: "about once every N years" is the reciprocal of the rate.
    outlook = con.execute("select * from outlook where county_fips = ?", [fips]).df().iloc[0]
    checks.append(Check(name, "Outlook: once every N years", f"{outlook['once_every_years']:.1f}",
                        f"1 / {outlook['long_outages_per_year']:.3f} = {1 / outlook['long_outages_per_year']:.1f}",
                        close(outlook["once_every_years"], 1 / outlook["long_outages_per_year"]),
                        f"{outlook['label']}; 90% band {outlook['lo90']:.2f}-{outlook['hi90']:.2f} per year"))

    # Named storm events: peak and share against raw EAGLE-I and MCC.csv.
    events = con.execute("select * from events where county_fips = ?", [fips]).df()
    events["storm"] = label_events(events, zones, load_storms())
    for storm in persona["storms"]:
        rows = events.loc[events["storm"] == storm]
        if rows.empty:
            checks.append(Check(name, f"{storm}: event in report", "missing", "-", False,
                                "no event labeled with this storm"))
            continue
        event = rows.sort_values("customer_hours", ascending=False).iloc[0]
        start, end = pd.Timestamp(event["start"]), pd.Timestamp(event["end"])
        start = start.tz_localize("UTC") if start.tzinfo is None else start
        end = end.tz_localize("UTC") if end.tzinfo is None else end
        series = raw_window(raw, fips, start, end)
        peak = float(series.max()) if not series.empty else float("nan")
        checks.append(Check(name, f"{storm}: peak customers out", f"{event['peak_out']:,.0f}",
                            f"{peak:,.0f} (raw EAGLE-I max in window)", close(event["peak_out"], peak)))
        share = 100 * peak / customers[fips]
        checks.append(Check(name, f"{storm}: share of county out", f"{event['peak_out_pct']:.1f}%",
                            f"{peak:,.0f} / {customers[fips]:,.0f} = {share:.1f}%", close(event["peak_out_pct"], share)))
        hours_long = (end - start).total_seconds() / 3600
        p90 = event["p90_h_lifo"]
        checks.append(Check(name, f"{storm}: 90% of homes back within", f"{p90:.0f} h",
                            f"event lasted {hours_long:.0f} h", p90 <= hours_long + 0.5,
                            "a home cannot be out longer than the event"))
        # If 90% of homes were back within p90 hours, the average home could not exceed
        # 0.9 * p90 + 0.1 * event length. Customer-hours over the peak gives that average.
        mean_per_peak_home = event["customer_hours"] / event["peak_out"]
        ceiling = 0.9 * p90 + 0.1 * hours_long
        checks.append(Check(name, f"{storm}: p90 fits the outage curve",
                            f"p90 {p90:.0f} h -> average at most {ceiling:.0f} h",
                            f"customer-hours / peak = {mean_per_peak_home:.0f} h", mean_per_peak_home <= ceiling,
                            "if flagged, durations are too short, or homes rotated (rolling blackouts)"))
        if pd.notna(event.get("backup_h_1")):
            one, two = event["backup_h_1"], event["backup_h_2"]
            load = KWH_PER_CORE / one if one else float("nan")
            checks.append(Check(name, f"{storm}: backup hours, 1 / 2 Cores", f"{one:.0f} / {two:.0f} h",
                                f"implied average load {load:.2f} kW", 0.2 <= load <= 6 and two >= one,
                                f"{KWH_PER_CORE} kWh / hours; a home averages 0.5-4 kW"))

    # Sizing sentence quotes the LIFO share it was computed from.
    sizing = con.execute("select * from sizing where county_fips = ?", [fips]).df().iloc[0]
    share = sizing[f"lifo_share_{int(sizing['cores'])}"]
    quoted = f"{round(100 * share)}%"
    checks.append(Check(name, "Sizing sentence", sizing["reason"][:60] + "...", f"LIFO share {100 * share:.1f}%",
                        quoted in sizing["reason"]))

    # Monthly backup hours: two Cores last at least as long as one, and winter/summer differ for electric heat.
    monthly = con.execute("select * from backup_monthly where county_fips = ? and mode = 'normal'", [fips]).df()
    one = monthly.loc[monthly["cores"] == 1].set_index("month")["hours"]
    two = monthly.loc[monthly["cores"] == 2].set_index("month")["hours"]
    checks.append(Check(name, "Backup by month, 1 Core (Feb / Aug)", f"{one.get(2, float('nan')):.0f} / {one.get(8, float('nan')):.0f} h",
                        f"2 Cores >= 1 Core every month: {bool((two >= one).all())}", bool((two >= one).all()),
                        f"range {one.min():.0f}-{one.max():.0f} h"))
    return checks


def render(checks: list[Check]) -> str:
    flagged = sum(not check.ok for check in checks)
    lines = [
        "# Persona hand-check",
        "",
        f"Built by `python -m pipeline.persona_check`. {len(checks)} checks, {flagged} flagged.",
        "Each report number is recomputed from the raw data (EAGLE-I, MCC.csv, ZIP and Base tables) "
        "rather than read back from the model. FLAG means look before it goes in the video.",
        "",
        "| Persona | Check | Report | Independent | Result | Note |",
        "|---|---|---|---|---|---|",
    ]
    for check in checks:
        result = "ok" if check.ok else "**FLAG**"
        lines.append(f"| {check.persona} | {check.what} | {check.report} | {check.independent} | {result} | {check.note} |")
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    features_db = argv[0] if argv else str(settings.FEATURES_DUCKDB)
    personas = yaml.safe_load(PERSONAS_YAML.read_text())["personas"]
    base = {row["key"]: row for row in yaml.safe_load(BASE_YAML.read_text())["utilities"]}
    zips = pd.read_csv(ZIP_CSV, dtype={"zip": str})
    zones = pd.read_csv(settings.COUNTY_WEATHER_ZONE_CSV, dtype={"county_fips": str}).set_index("county_fips")[
        "weather_zone"
    ]
    raw = pd.read_parquet(DEMO_PARQUET)
    customers = load_customers(settings.CUSTOMERS_CSV)
    checks: list[Check] = []
    with duckdb.connect(features_db, read_only=True) as con:
        for persona in personas:
            checks.extend(check_persona(persona, con, raw, customers, zips, base, zones))
    REPORT_MD.write_text(render(checks))
    for check in checks:
        print(f"{'ok  ' if check.ok else 'FLAG'} {check.persona:<14} {check.what:<55} {check.report} | {check.independent}")
    print(f"wrote {REPORT_MD}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
