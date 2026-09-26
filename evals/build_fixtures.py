"""Build the 24 narrator eval fixtures: 8 counties, one per ERCOT weather zone, by 3 homes.

Run: python -m evals.build_fixtures   (after pipeline.backtest)

Outlook and events come from the real tables. Backup hours come from each zone's
2024 ERCOT profile. Sizing here uses the event month's typical-day backup hours
in place of a full seven-day replay, which is close enough to exercise the
narrator; the report itself uses the replay in data/features.duckdb.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

from api.app.sim.backup import hours_by_month
from pipeline import settings
from pipeline.backtest import load_zones
from pipeline.events import customer_durations, event_curve
from pipeline.sizing import covered_share, long_hours, size_cores
from pipeline.sources.eaglei import demo_series
from pipeline.sources.ercot_profiles import cached_days_by_month, profile_code, typical_day

FIXTURE_DIR = Path(__file__).resolve().parent / "fixtures"
PROFILE_YEAR = 2024
COUNTIES = {
    "48085": "Collin",
    "48201": "Harris",
    "48453": "Travis",
    "48215": "Hidalgo",
    "48423": "Smith",
    "48451": "Tom Green",
    "48329": "Midland",
    "48485": "Wichita",
}
# key: (label, profile type, annual kWh relative to the profile's typical customer)
HOMES = {
    "electric-heat": ("electric heat", "RESHIWR", 1.0),
    "gas-heat": ("gas heat", "RESLOWR", 1.0),
    "large-gas-heat": ("gas heat and a larger footprint", "RESLOWR", 1.5),
}


def _central_iso(stamp) -> str:
    return pd.Timestamp(stamp).tz_convert("America/Chicago").isoformat()


def _monthly(days_by_month: dict, scale: float) -> dict[str, list[float]]:
    typical = [typical_day([trace for _, trace in days_by_month[m]]) for m in range(1, 13)]
    profile_total = float(sum(trace.sum() for days in days_by_month.values() for _, trace in days))
    table = hours_by_month(typical, profile_annual_kwh=profile_total, home_annual_kwh=profile_total * scale)
    return {key: [round(value, 1) for value in table[key]] for key in ("cores_1", "cores_2")}


def _sizing(events: pd.DataFrame, series: pd.Series, monthly: dict[str, list[float]]) -> dict:
    long = events.loc[events[f"share_12h_{settings.LONG_OUTAGE_ORDER}"] > 0]
    parts: dict[int, list[tuple[float, float]]] = {1: [], 2: []}
    for _, event in long.iterrows():
        curve = event_curve(series, event["start"], event["end"])
        durations, weights = customer_durations(curve, order=settings.LONG_OUTAGE_ORDER)
        month = pd.Timestamp(event["start"]).tz_convert("America/Chicago").month
        for cores in (1, 2):
            parts[cores].append(long_hours(durations, weights, monthly[f"cores_{cores}"][month - 1]))
    shares = {cores: covered_share(parts[cores]) for cores in (1, 2)}
    cores = size_cores(shares)
    return {"cores": cores, "share": round(shares[cores], 4)}


def build() -> list[Path]:
    outlook = pd.read_parquet(settings.OUTLOOK_PARQUET)
    events = pd.read_parquet(settings.TEXAS_EVENTS_PARQUET)
    zones, _ = load_zones(settings.COUNTY_WEATHER_ZONE_CSV, pd.Index(list(COUNTIES)))
    codes = tuple(profile_code(profile, zone) for zone in set(zones) for _, profile, _ in HOMES.values())
    series = demo_series(fips=tuple(COUNTIES))
    since = pd.Timestamp(settings.RATES_START).year
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    written = []
    for fips, name in COUNTIES.items():
        county_events = events.loc[events["county_fips"] == fips].sort_values("customer_hours", ascending=False)
        row = outlook.loc[fips]
        for key, (label, profile, scale) in HOMES.items():
            days = cached_days_by_month(PROFILE_YEAR, profile, zones[fips], also=codes)
            monthly = _monthly(days, scale)
            report = {
                "county": {"fips": fips, "name": name, "weather_zone": zones[fips]},
                "home": {"label": label, "profile_type": profile, "annual_kwh_scale": scale},
                "outlook": {
                    "label": row["label"], "long_outages_per_year": round(float(row["long_outages_per_year"]), 4),
                    "once_every_years": round(float(row["once_every_years"]), 2),
                    "years_of_data": round(float(row["years_of_data"]), 2), "since": since,
                },
                "events": [
                    {
                        "start": _central_iso(event["start"]),
                        "peak_out_pct": round(float(event["peak_out_pct"]), 2),
                        "duration_h": {
                            "p50": [round(float(event["p50_h_rotate"]), 2), round(float(event["p50_h_stay"]), 2)],
                            "p90": [round(float(event["p90_h_rotate"]), 2), round(float(event["p90_h_stay"]), 2)],
                        },
                    }
                    for _, event in county_events.head(2).iterrows()
                ],
                "backup": {"hours_by_month": monthly, "profile_year": PROFILE_YEAR},
                "sizing": _sizing(county_events, series[fips], monthly),
            }
            path = FIXTURE_DIR / f"{fips}-{key}.json"
            path.write_text(json.dumps(report, indent=2) + "\n")
            written.append(path)
    return written


def main() -> int:
    written = build()
    print(f"wrote {len(written)} fixtures to {FIXTURE_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
