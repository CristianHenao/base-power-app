"""ZIP -> utility candidates for the address flow.

Two sources, because neither covers Texas alone:
- NREL/OpenEI utility look-up by ZIP (2024): co-ops, munis and other bundled
  utilities. It has no rows for the competitive-area wires companies (Oncor,
  CenterPoint, AEP Texas, TNMP), which is where Base sells Energy + Backup.
- PUCT Power to Choose: for a competitive ZIP it lists retail plans, each tagged with
  the wires company (TDU). We keep only the TDU names. Non-competitive ZIPs return none.

A ZIP can have several candidates. The app always asks the user to confirm.

Run: python -m pipeline.sources.zip_utility [--fetch]
"""
from __future__ import annotations

import json
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd

from pipeline import settings

NREL_DIR = settings.REPO_ROOT / "data" / "raw" / "nrel"
NREL_FILES = ("iou_zipcodes_2024.csv", "non_iou_zipcodes_2024.csv")
PTC_CACHE = settings.REPO_ROOT / "data" / "raw" / "ptc" / "zip_tdu.json"
PTC_URL = "http://api.powertochoose.org/api/PowerToChoose/plans?zip_code={}"
ERCOT_ZIPS = settings.REPO_ROOT / "data" / "raw" / "reference" / "ercot_profile_decision_tree_050124.xlsx"
OUT_CSV = settings.REPO_ROOT / "data" / "processed" / "zip_utility.csv"

# Power to Choose TDU names -> EIA-861 utility number.
TDU_EIA_ID = {
    "CENTERPOINT": 8901,
    "ONCOR": 44372,
    "AEP TEXAS CENTRAL": 3278,
    "AEP TEXAS NORTH": 20404,
    "TEXAS-NEW MEXICO POWER": 40051,
    "TEXAS NEW MEXICO POWER": 40051,
    "LUBBOCK POWER": 11292,
    "NUECES ELECTRIC": 13830,  # co-op that opted into retail choice
}


def tdu_eia_id(name: str) -> int | None:
    upper = name.upper()
    return next((eia_id for key, eia_id in TDU_EIA_ID.items() if key in upper), None)


def read_nrel(nrel_dir: Path = NREL_DIR, state: str = "TX") -> pd.DataFrame:
    """Bundled utilities per ZIP. Retail power marketers (TXU, Reliant) are dropped."""
    frame = pd.concat(
        [pd.read_csv(nrel_dir / name, dtype={"zip": str}) for name in NREL_FILES],
        ignore_index=True,
    )
    frame = frame.loc[(frame["state"] == state) & (frame["ownership"] != "Retail Power Marketer")]
    return pd.DataFrame(
        {
            "zip": frame["zip"].str.zfill(5),
            "utility_id": frame["eiaid"].astype(int),
            "source": "nrel_2024",
        }
    ).drop_duplicates(["zip", "utility_id"])


def ptc_tdus(payload: dict) -> list[str]:
    """Distinct TDU names in one Power to Choose response."""
    return sorted({row["company_tdu_name"] for row in payload.get("data") or [] if row.get("company_tdu_name")})


def _fetch_one(zip_code: str, pause: float) -> tuple[str, list[str] | None]:
    request = urllib.request.Request(PTC_URL.format(zip_code), headers={"User-Agent": "porchlight-pipeline"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return zip_code, ptc_tdus(json.load(response))
    except Exception as error:  # noqa: BLE001 - keep going, retry on the next run
        print(f"{zip_code}: {error}")
        return zip_code, None
    finally:
        time.sleep(pause)


def fetch_ptc(
    zips: list[str],
    cache_path: Path = PTC_CACHE,
    workers: int = 4,
    pause: float = 0.3,
) -> dict[str, list[str]]:
    """Query Power to Choose once per ZIP, a few at a time, caching as we go so a rerun resumes."""
    cache: dict[str, list[str]] = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    todo = [zip_code for zip_code in zips if zip_code not in cache]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = pool.map(lambda zip_code: _fetch_one(zip_code, pause), todo)
        for count, (zip_code, tdus) in enumerate(results, start=1):
            if tdus is not None:
                cache[zip_code] = tdus
            if count % 200 == 0:
                cache_path.write_text(json.dumps(cache))
                print(f"{count}/{len(todo)}", flush=True)
    cache_path.write_text(json.dumps(cache))
    return cache


def ptc_frame(cache: dict[str, list[str]]) -> pd.DataFrame:
    rows = [
        {"zip": zip_code, "utility_id": tdu_eia_id(name), "tdu_name": name}
        for zip_code, names in cache.items()
        for name in names
    ]
    frame = pd.DataFrame(rows, columns=["zip", "utility_id", "tdu_name"])
    unknown = sorted(frame.loc[frame["utility_id"].isna(), "tdu_name"].unique())
    if unknown:
        raise ValueError(f"Power to Choose TDUs with no EIA id: {', '.join(unknown)}")
    return frame.assign(utility_id=frame["utility_id"].astype(int), source="puct_ptc")[
        ["zip", "utility_id", "source"]
    ]


def ercot_zips(path: Path = ERCOT_ZIPS) -> list[str]:
    frame = pd.read_excel(path, sheet_name="ZipToZone", header=4, dtype=str)
    return sorted(frame["Svc. Address ZIP Code"].dropna().str.strip().str.zfill(5).unique())


def combine(nrel: pd.DataFrame, ptc: pd.DataFrame, names: pd.Series) -> pd.DataFrame:
    """One row per ZIP and candidate utility. PTC (competitive TDU) rows sort first."""
    frame = pd.concat([ptc, nrel], ignore_index=True).drop_duplicates(["zip", "utility_id"])
    frame["utility_name"] = frame["utility_id"].map(names)
    frame["candidates"] = frame.groupby("zip")["utility_id"].transform("size")
    return frame.sort_values(["zip", "source"], ascending=[True, False]).reset_index(drop=True)


def main(argv: list[str]) -> int:
    if "--fetch" in argv:
        fetch_ptc(ercot_zips())
    cache = json.loads(PTC_CACHE.read_text()) if PTC_CACHE.exists() else {}
    names = pd.read_csv(
        settings.REPO_ROOT / "data" / "processed" / "county_utility.csv"
    ).drop_duplicates("utility_id").set_index("utility_id")["utility_name"]
    table = combine(read_nrel(), ptc_frame(cache), names)
    OUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    table.to_csv(OUT_CSV, index=False)
    print(f"{table['zip'].nunique():,} ZIPs, {len(table):,} rows; "
          f"{(table.drop_duplicates('zip')['candidates'] > 1).sum():,} ZIPs with more than one candidate")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
