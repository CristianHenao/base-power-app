"""Download every raw input into data/raw. Safe to rerun: files already on disk are skipped.

Run: python -m pipeline.download [--with-ptc]

--with-ptc also asks Power to Choose for the wires company of each ERCOT ZIP (about 15 minutes).
ERCOT RTM prices come from pipeline.sources.ercot_prices (gridstatus, the `data` extra).
Sources, licenses and as-of dates are listed in docs/DATA_SOURCES.md.
"""
from __future__ import annotations

import csv
import json
import re
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

from pipeline import settings

RAW = settings.REPO_ROOT / "data" / "raw"
REFERENCE = RAW / "reference"
USER_AGENT = "Mozilla/5.0 (porchlight-pipeline)"

EAGLEI_ARTICLE = "https://api.figshare.com/v2/articles/24237376"
EAGLEI_REFERENCE_FILES = ("MCC.csv", "DQI.csv", "coverage_history.csv")
ERCOT_PROFILES_PAGE = "https://www.ercot.com/mktinfo/loadprofile/alp"
ERCOT_ZIP_TO_ZONE = "https://www.ercot.com/files/docs/2024/04/30/Appendix_D_Profile_Decision_Tree_050124.xlsx"
ZCTA_COUNTY = "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt"
COUNTY_SHAPES = "https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json"
EIA861_ZIP = "https://www.eia.gov/electricity/data/eia861/zip/f8612024.zip"
ACS_B25032 = (
    "https://www2.census.gov/programs-surveys/acs/summary_file/2024/"
    "table-based-SF/data/5YRData/acsdt5y2024-b25032.dat"
)
NREL_ZIPS = "https://data.openei.org/files/8563/{}_zipcodes_2024.csv"
NRI_QUERY = (
    "https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/"
    "National_Risk_Index_Counties/FeatureServer/0/query"
)
NRI_FIELDS = (
    "STCOFIPS,COUNTY,NRI_VER,RISK_SCORE,HRCN_RISKS,WNTW_RISKS,ISTM_RISKS,SWND_RISKS,TRND_RISKS,"
    "HWAV_RISKS,HAIL_RISKS,CWAV_RISKS,CFLD_RISKS,IFLD_RISKS,WFIR_RISKS,LTNG_RISKS"
)


def _open(url: str, timeout: int = 300):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=timeout)


def fetch(url: str, path: Path, size: int | None = None) -> Path:
    """Stream `url` to `path` unless a complete copy is already there."""
    if path.exists() and (size is None or path.stat().st_size == size):
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(path.suffix + ".part")
    with _open(url) as response, partial.open("wb") as out:
        while chunk := response.read(1 << 20):
            out.write(chunk)
    partial.replace(path)
    print(f"downloaded {path.relative_to(settings.REPO_ROOT)}")
    return path


def strip_bom(path: Path) -> None:
    data = path.read_bytes()
    if data.startswith(b"\xef\xbb\xbf"):
        path.write_bytes(data[3:])


def eaglei(first_year: int = int(settings.RATES_START[:4])) -> None:
    """Yearly outage CSVs into data/raw/eaglei, reference files into data/raw/reference."""
    with _open(EAGLEI_ARTICLE) as response:
        files = json.load(response)["files"]
    for item in files:
        name = item["name"]
        match = re.fullmatch(r"eaglei_outages_(\d{4})\.csv", name)
        if match and int(match.group(1)) >= first_year:
            fetch(item["download_url"], settings.RAW_EAGLEI_DIR / name, item["size"])
        elif name in EAGLEI_REFERENCE_FILES:
            # Reference files stay out of the yearly folder, which the loaders glob for *.csv.
            fetch(item["download_url"], REFERENCE / name)
            strip_bom(REFERENCE / name)


def ercot_profiles(first_year: int = 2018) -> None:
    """ERCOT backcasted (actual) load profiles, one zip per year."""
    with _open(ERCOT_PROFILES_PAGE) as response:
        page = response.read().decode("utf-8", "replace")
    for href in sorted(set(re.findall(r'href="([^"]+\.zip)"', page))):
        name = urllib.parse.unquote(href.rsplit("/", 1)[-1])
        year = re.search(r"(20\d\d)", name)
        if year and int(year.group(1)) >= first_year:
            fetch(urllib.parse.urljoin(ERCOT_PROFILES_PAGE, href), settings.RAW_ERCOT_DIR / name)


def eia861() -> None:
    path = fetch(EIA861_ZIP, RAW / "eia861" / "f8612024.zip")
    with zipfile.ZipFile(path) as archive:
        for member in archive.namelist():
            if member.endswith(".xlsx") and not (path.parent / member).exists():
                archive.extract(member, path.parent)


def nri() -> None:
    """FEMA National Risk Index, Texas counties, from FEMA's ArcGIS service (the zip download blocks scripts)."""
    path = RAW / "fema" / "nri_counties_tx.csv"
    if path.exists():
        return
    query = urllib.parse.urlencode(
        {"where": "STATEABBRV='TX'", "outFields": NRI_FIELDS, "returnGeometry": "false", "f": "json"}
    )
    with _open(f"{NRI_QUERY}?{query}") as response:
        rows = [feature["attributes"] for feature in json.load(response)["features"]]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f"downloaded {path.relative_to(settings.REPO_ROOT)} ({len(rows)} counties)")


def main(argv: list[str]) -> int:
    eaglei()
    ercot_profiles()
    fetch(ERCOT_ZIP_TO_ZONE, REFERENCE / "ercot_profile_decision_tree_050124.xlsx")
    fetch(ZCTA_COUNTY, REFERENCE / "zcta520_county20_natl.txt")
    fetch(COUNTY_SHAPES, RAW / "us-counties-20m.json")
    eia861()
    nri()
    fetch(ACS_B25032, RAW / "census" / "acsdt5y2024-b25032.dat")
    for kind in ("iou", "non_iou"):
        fetch(NREL_ZIPS.format(kind), RAW / "nrel" / f"{kind}_zipcodes_2024.csv")
    if "--with-ptc" in argv:
        from pipeline.sources.zip_utility import ercot_zips, fetch_ptc

        fetch_ptc(ercot_zips())
    print("raw inputs are in data/raw")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
