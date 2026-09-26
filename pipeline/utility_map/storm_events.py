"""NOAA Storm Events for Texas, one row per event and county (UM-3.1).

Source: NCEI Storm Events Database bulk CSVs,
https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/ (details files, 2000-2025).
Events are filed by county (CZ_TYPE "C") or by NWS forecast zone ("Z"); zone events are
expanded to every county in the zone with the NWS zone-county correlation file
(https://www.weather.gov/gis/ZoneCounty) and flagged via_zone. Marine zones are dropped.
Times are local standard time per CZ_TIMEZONE ("CST-6"); stored as UTC plus the local date.

Run: python -m pipeline.utility_map.storm_events download
     python -m pipeline.utility_map.storm_events
"""
from __future__ import annotations

import re
import sys
import urllib.request
from pathlib import Path

import pandas as pd

from pipeline import settings
from pipeline.utility_map.manifest import record

BASE_URL = "https://www.ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/"
ZONE_URL = "https://www.weather.gov/source/gis/Shapefiles/County/bp16ap26.dbx"
YEARS = range(2000, 2026)
RAW = settings.RAW_DIR / "noaa_storm_events"
OUT = settings.UTILITY_MAP_DIR / "storm_events.parquet"
MULTIPLIERS = {"K": 1e3, "M": 1e6, "B": 1e9}
COLUMNS = [
    "EVENT_ID", "EPISODE_ID", "STATE_FIPS", "EVENT_TYPE", "CZ_TYPE", "CZ_FIPS", "BEGIN_YEARMONTH", "BEGIN_DAY",
    "BEGIN_TIME", "END_YEARMONTH", "END_DAY", "END_TIME", "CZ_TIMEZONE", "INJURIES_DIRECT", "INJURIES_INDIRECT",
    "DEATHS_DIRECT", "DEATHS_INDIRECT", "DAMAGE_PROPERTY", "DAMAGE_CROPS", "MAGNITUDE", "BEGIN_LAT", "BEGIN_LON",
]


def zone_counties(path: Path, state: str = "TX") -> dict[str, list[str]]:
    """STATE_ZONE (e.g. "TX213") → sorted county FIPS, from the pipe-delimited NWS file."""
    out: dict[str, set[str]] = {}
    for line in path.read_text().splitlines():
        parts = line.split("|")
        if len(parts) < 7 or parts[0] != state:
            continue
        out.setdefault(parts[4], set()).add(parts[6].zfill(5))
    return {zone: sorted(fips) for zone, fips in out.items()}


def parse_damage(text: object) -> float | None:
    if text is None or (isinstance(text, float) and pd.isna(text)) or str(text).strip() == "":
        return None
    match = re.fullmatch(r"([0-9.]+)([KMB]?)", str(text).strip().upper())
    if not match:
        return None
    return float(match.group(1)) * MULTIPLIERS.get(match.group(2), 1.0)


def _time(yearmonth: pd.Series, day: pd.Series, hhmm: pd.Series, zone: pd.Series) -> tuple[pd.Series, pd.Series]:
    local = pd.to_datetime(
        yearmonth.astype(int).astype(str) + day.astype(int).astype(str).str.zfill(2)
        + hhmm.astype(int).astype(str).str.zfill(4),
        format="%Y%m%d%H%M",
    )
    offset = zone.astype(str).str.extract(r"([+-]\d+)")[0].astype(float).fillna(-6.0)
    utc = (local - pd.to_timedelta(offset, unit="h")).dt.tz_localize("UTC")
    return utc, local.dt.date


def normalize(frame: pd.DataFrame, zones: dict[str, list[str]]) -> pd.DataFrame:
    tx = frame.loc[(frame["STATE_FIPS"] == 48) & frame["CZ_TYPE"].isin(["C", "Z"])].copy()
    code = tx["CZ_FIPS"].astype(int).astype(str).str.zfill(3)
    tx["county_list"] = [
        ["48" + c] if kind == "C" else zones.get(f"TX{c}", [])
        for kind, c in zip(tx["CZ_TYPE"], code)
    ]
    tx["via_zone"] = tx["CZ_TYPE"] == "Z"
    begin_utc, begin_date = _time(tx["BEGIN_YEARMONTH"], tx["BEGIN_DAY"], tx["BEGIN_TIME"], tx["CZ_TIMEZONE"])
    end_utc, _ = _time(tx["END_YEARMONTH"], tx["END_DAY"], tx["END_TIME"], tx["CZ_TIMEZONE"])
    out = pd.DataFrame({
        "event_id": tx["EVENT_ID"].astype(int),
        "episode_id": tx["EPISODE_ID"].astype("Int64"),
        "event_type": tx["EVENT_TYPE"].astype(str),
        "county_fips": tx["county_list"],
        "begin_utc": begin_utc,
        "end_utc": end_utc,
        "begin_local_date": begin_date,
        "begin_lat": pd.to_numeric(tx["BEGIN_LAT"], errors="coerce"),
        "begin_lon": pd.to_numeric(tx["BEGIN_LON"], errors="coerce"),
        "magnitude": pd.to_numeric(tx["MAGNITUDE"], errors="coerce"),
        "injuries": tx["INJURIES_DIRECT"].fillna(0).astype(int) + tx["INJURIES_INDIRECT"].fillna(0).astype(int),
        "deaths": tx["DEATHS_DIRECT"].fillna(0).astype(int) + tx["DEATHS_INDIRECT"].fillna(0).astype(int),
        "damage_usd": [
            None if p is None and c is None else (p or 0.0) + (c or 0.0)
            for p, c in zip(tx["DAMAGE_PROPERTY"].map(parse_damage), tx["DAMAGE_CROPS"].map(parse_damage))
        ],
        "via_zone": tx["via_zone"],
    })
    return out.explode("county_fips").dropna(subset=["county_fips"]).reset_index(drop=True)


def _files() -> list[Path]:
    files = []
    for year in YEARS:
        matches = sorted(RAW.glob(f"StormEvents_details-ftp_v1.0_d{year}_c*.csv.gz"))
        if not matches:
            raise FileNotFoundError(f"no Storm Events details file for {year} in {RAW}; run download")
        files.append(matches[-1])
    return files


def download() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    listing = urllib.request.urlopen(BASE_URL, timeout=60).read().decode()
    for year in YEARS:
        names = sorted(set(re.findall(rf"StormEvents_details-ftp_v1\.0_d{year}_c\d+\.csv\.gz", listing)))
        if names and not (RAW / names[-1]).exists():
            urllib.request.urlretrieve(BASE_URL + names[-1], RAW / names[-1])
            print(f"downloaded {names[-1]}")
    zone_file = RAW / Path(ZONE_URL).name
    if not zone_file.exists():
        urllib.request.urlretrieve(ZONE_URL, zone_file)


def main(argv: list[str]) -> int:
    if argv[:1] == ["download"]:
        download()
        return 0
    zone_file = RAW / Path(ZONE_URL).name
    zones = zone_counties(zone_file)
    files = _files()
    frames, unmapped, zone_total = [], 0, 0
    for path in files:
        raw = pd.read_csv(path, usecols=COLUMNS, low_memory=False)
        zone_rows = raw.loc[(raw["STATE_FIPS"] == 48) & (raw["CZ_TYPE"] == "Z"), "CZ_FIPS"].astype(int)
        zone_total += len(zone_rows)
        unmapped += int((~("TX" + zone_rows.astype(str).str.zfill(3)).isin(zones)).sum())
        frames.append(normalize(raw, zones))
    events = pd.concat(frames, ignore_index=True)
    print(f"{unmapped:,} of {zone_total:,} zone events use retired zone codes and were left out")
    events.to_parquet(OUT, index=False)
    record("noaa_storm_events", BASE_URL, *files, zone_file, rows=len(events),
           period_start=f"{min(YEARS)}-01-01", period_end=f"{max(YEARS)}-12-31",
           note=f"Texas rows; zone events expanded to counties with NWS zone-county file bp16ap26; "
                f"{unmapped} of {zone_total} zone events use retired zone codes and are left out.")
    print(f"wrote {OUT}: {len(events):,} event-county rows, {events['event_id'].nunique():,} events")
    print(events["event_type"].value_counts().head(20).to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
