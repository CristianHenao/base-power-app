"""Paths and demo constants. This is the only module that names directories."""
from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]

RAW_EAGLEI_DIR = REPO_ROOT / "data" / "raw" / "eaglei"
EVENTS_PARQUET = REPO_ROOT / "data" / "processed" / "events.parquet"
CUSTOMERS_CSV = REPO_ROOT / "data" / "raw" / "reference" / "MCC.csv"
RAW_ERCOT_DIR = REPO_ROOT / "data" / "raw" / "ercot"

# Rates and the event table both start here. Earlier EAGLE-I years have thin coverage.
RATES_START = "2018-01-01"

DEMO_COUNTIES: dict[str, str] = {
    "48085": "Collin",
    "48201": "Harris",
    "48453": "Travis",
}
DEMO_FIPS: tuple[str, ...] = tuple(DEMO_COUNTIES)

# ERCOT weather zones for the demo counties. Confirm against Alejandro's crosswalk.
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
