"""Paths and demo constants. This is the only module that names directories."""
from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
# Local secrets such as XAI_API_KEY. Gitignored.
ENV_FILE = REPO_ROOT / ".env"
# Raw downloads (gitignored). A worktree can point this at the main checkout's data/raw.
RAW_DIR = Path(os.environ.get("PORCHLIGHT_RAW_DIR", REPO_ROOT / "data" / "raw"))
# Normalized tables and the source manifest for the utility map.
UTILITY_MAP_DIR = REPO_ROOT / "data" / "processed" / "utility_map"

RAW_EAGLEI_DIR = REPO_ROOT / "data" / "raw" / "eaglei"
EVENTS_PARQUET = REPO_ROOT / "data" / "processed" / "events.parquet"
TEXAS_EVENTS_PARQUET = REPO_ROOT / "data" / "processed" / "events_texas.parquet"
OUTLOOK_PARQUET = REPO_ROOT / "data" / "processed" / "outlook.parquet"
BACKTEST_JSON = REPO_ROOT / "data" / "processed" / "backtest.json"
FEATURES_DUCKDB = REPO_ROOT / "data" / "features.duckdb"
# Alejandro's crosswalk (pipeline/sources/crosswalk.py). Without it the
# empirical-Bayes prior is fit statewide.
COUNTY_WEATHER_ZONE_CSV = REPO_ROOT / "data" / "processed" / "county_weather_zone.csv"
# Alejandro's EIA-861 crosswalks and Base's offer by utility.
COUNTY_UTILITY_CSV = REPO_ROOT / "data" / "processed" / "county_utility.csv"
ZIP_UTILITY_CSV = REPO_ROOT / "data" / "processed" / "zip_utility.csv"
BASE_AVAILABILITY_YAML = REPO_ROOT / "data" / "reference" / "base_availability.yaml"
STATEWIDE_ZONE = "TX"
CUSTOMERS_CSV = REPO_ROOT / "data" / "raw" / "reference" / "MCC.csv"
RAW_ERCOT_DIR = REPO_ROOT / "data" / "raw" / "ercot"
ERCOT_CACHE_DIR = RAW_ERCOT_DIR / "cache"
RAW_PRICES_DIR = REPO_ROOT / "data" / "raw" / "ercot_prices"
GRID_VALUE_PARQUET = REPO_ROOT / "data" / "processed" / "grid_value.parquet"
TAIL_SHARE_PARQUET = REPO_ROOT / "data" / "processed" / "tail_share.parquet"
INSIGHTS_JSON = REPO_ROOT / "data" / "processed" / "insights.json"
PAYS_TWICE_CSV = REPO_ROOT / "data" / "processed" / "pays_twice.csv"
REPORTS_DIR = REPO_ROOT / "data" / "processed" / "reports"
# Exported charts land where the web app serves static files.
INSIGHTS_CHART_DIR = REPO_ROOT / "public" / "insights"
RAW_EIA861_DIR = REPO_ROOT / "data" / "raw" / "eia861"
EIA861_CSV = REPO_ROOT / "data" / "processed" / "eia861_reliability.csv"
EIA861_YEARS = tuple(range(2019, 2025))
# EIA utility numbers for the Texas wires companies in the M-02 insight.
EIA861_UTILITIES: dict[int, str] = {
    44372: "Oncor",
    8901: "CenterPoint",
    3278: "AEP Texas Central",
    20404: "AEP Texas North",
    40051: "TNMP",
    1015: "Austin Energy",
}
PRICE_YEARS = tuple(range(2018, 2026))

# Rates and the event table both start here. Earlier EAGLE-I years have thin coverage.
RATES_START = "2018-01-01"
# Backtest windows, UTC, end exclusive.
BACKTEST_TRAIN = ("2018-01-01", "2023-01-01")
BACKTEST_TEST = ("2023-01-01", "2025-01-01")
# 12-hour-plus shares use the conservative long-tail ordering.
LONG_OUTAGE_ORDER = "stay"

DEMO_COUNTIES: dict[str, str] = {
    "48085": "Collin",
    "48201": "Harris",
    "48453": "Travis",
}
DEMO_FIPS: tuple[str, ...] = tuple(DEMO_COUNTIES)

# ERCOT weather zones for the demo counties. tests/test_backtest.py checks them against the crosswalk.
DEMO_WEATHER_ZONE: dict[str, str] = {
    "48085": "NCENT",
    "48201": "COAST",
    "48453": "SCENT",
}
# Sally in Collin heats with electricity. The other two personas use the non-heat profile.
DEMO_PROFILE: dict[str, str] = {
    "48085": "RESHIWR",
    "48201": "RESLOWR",
    "48453": "RESLOWR",
}

# MCC.csv from the EAGLE-I Figshare release: modeled customers per county, 2022.
CUSTOMERS_FIPS_COL = "County_FIPS"
CUSTOMERS_COUNT_COL = "Customers"

# Header of eaglei_outages_YYYY.csv, reviewed from the 2018 file.
EAGLEI_FIPS_COL = "fips_code"
EAGLEI_STATE_COL = "state"
EAGLEI_CUSTOMERS_OUT_COL = "customers_out"
EAGLEI_TIMESTAMP_COL = "run_start_time"

# ERCOT weather zones and residential profile types in the backcasted workbooks.
WEATHER_ZONES: tuple[str, ...] = ("COAST", "EAST", "FWEST", "NCENT", "NORTH", "SCENT", "SOUTH", "WEST")
PROFILE_TYPES: tuple[str, ...] = ("RESLOWR", "RESHIWR")
# Storm weeks replayed for every zone, as Central start dates.
STORM_WEEKS: dict[str, str] = {
    "Winter Storm Uri": "2021-02-14",
    "Hurricane Beryl": "2024-07-08",
}
TAIL_EVENTS = 5
HOME_LABELS: dict[str, str] = {"RESHIWR": "electric heat", "RESLOWR": "gas heat"}
REPORT_EVENTS = 5
