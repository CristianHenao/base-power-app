"""Texas ZIP to county, for addresses the Census geocoder cannot match.

Run: python -m pipeline.zip_county   (needs data/raw/reference/zcta520_county20_natl.txt; make download)

Each ZIP (Census 2020 ZCTA) gets the county holding most of its land area, and the share it
holds. Writes data/processed/zip_county.csv, small enough to commit and ship in the API image.
Also writes data/processed/reports/demo_zip_county.json — Collin/Harris/Travis only — for the
Next.js saved-report fallback when the Python API is down.
"""
from __future__ import annotations

import json
import sys

import pandas as pd

from pipeline import settings
from pipeline.sources.crosswalk import ZCTA_COUNTY_TXT, read_zcta_county

# Counties with a committed saved report (data/processed/reports/{fips}.json).
DEMO_COUNTY_FIPS = ("48085", "48201", "48453")
DEMO_ZIP_COUNTY_JSON = settings.REPO_ROOT / "data" / "processed" / "reports" / "demo_zip_county.json"


def majority_county(zcta_county: pd.DataFrame) -> pd.DataFrame:
    """zip, county_fips, share of the ZIP's land in that county."""
    land = zcta_county.groupby(["zip", "county_fips"], as_index=False)["land"].sum()
    land["share"] = land["land"] / land.groupby("zip")["land"].transform("sum").where(lambda v: v > 0, 1.0)
    best = land.sort_values(["zip", "land"], ascending=[True, False]).drop_duplicates("zip")
    return best[["zip", "county_fips", "share"]].reset_index(drop=True)


def demo_zip_map(table: pd.DataFrame) -> dict[str, str]:
    """ZIP → FIPS for ZIPs whose majority county is a demo county (no secondary-share guesses)."""
    demo = table.loc[table["county_fips"].isin(DEMO_COUNTY_FIPS), ["zip", "county_fips"]]
    return dict(sorted(zip(demo["zip"].astype(str), demo["county_fips"].astype(str), strict=True)))


def main() -> int:
    table = majority_county(read_zcta_county(ZCTA_COUNTY_TXT))
    table.to_csv(settings.ZIP_COUNTY_CSV, index=False, float_format="%.3f")
    print(f"wrote {len(table):,} Texas ZIPs to {settings.ZIP_COUNTY_CSV}")
    demo = demo_zip_map(table)
    DEMO_ZIP_COUNTY_JSON.write_text(json.dumps(demo, indent=0, sort_keys=True) + "\n")
    print(f"wrote {len(demo):,} demo ZIPs to {DEMO_ZIP_COUNTY_JSON}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
