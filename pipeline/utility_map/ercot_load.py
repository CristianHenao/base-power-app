"""ERCOT hourly native load by weather zone, zone peaks, and peak estimates for
wires utilities that EIA-861 lists without one (UM-1.2).

Source: ERCOT Hourly Load Data Archives, https://www.ercot.com/gridinfo/load/load_hist.
Each annual workbook has "Hour Ending" in Central time (older years spell it
"HourEnding"), "24:00" for midnight, and the repeated fall-back hour marked "02:00 DST".

Run: python -m pipeline.utility_map.ercot_load download   (saves the zips to RAW_DIR/ercot_load)
     python -m pipeline.utility_map.ercot_load            (parses them and fills missing peaks)
"""
from __future__ import annotations

import sys
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

from pipeline import settings
from pipeline.utility_map.manifest import record

PAGE = "https://www.ercot.com/gridinfo/load/load_hist"
ARCHIVES = {
    2018: "2019/01/07/native_load_2018.zip",
    2019: "2020/01/09/Native_Load_2019.zip",
    2020: "2021/01/12/Native_Load_2020.zip",
    2021: "2021/11/12/Native_Load_2021.zip",
    2022: "2022/02/08/Native_Load_2022.zip",
    2023: "2023/02/09/Native_Load_2023.zip",
    2024: "2024/02/06/Native_Load_2024.zip",
    2025: "2025/02/11/Native_Load_2025.zip",
}
PEAK_YEAR = 2024  # matches the EIA-861 vintage
ZONES = ("COAST", "EAST", "FWEST", "NORTH", "NCENT", "SOUTH", "SCENT", "WEST")
SUMMER, WINTER = (6, 7, 8, 9), (12, 1, 2)
RAW = settings.RAW_DIR / "ercot_load"
OUT_DIR = settings.UTILITY_MAP_DIR


def parse_native_load(frame: pd.DataFrame) -> pd.DataFrame:
    """Wide hour-ending Central rows → long (weather_zone, hour_start_utc, load_mw)."""
    column = "Hour Ending" if "Hour Ending" in frame.columns else "HourEnding"
    # One 2022 cell is an Excel date instead of text; write it back in the text form.
    text = frame[column].map(lambda v: v.strftime("%m/%d/%Y %H:%M") if hasattr(v, "strftime") else str(v)).str.strip()
    repeated = text.str.endswith("DST").to_numpy()
    text = text.str.replace(" DST", "", regex=False)
    day = pd.to_datetime(text.str.slice(0, 10), format="%m/%d/%Y")
    hour = text.str.slice(11, 13).astype(int)
    local_start = day + pd.to_timedelta(hour - 1, unit="h")
    # The unmarked copy of the repeated hour is daylight time; the "DST"-marked copy is standard.
    start = local_start.dt.tz_localize("America/Chicago", ambiguous=~repeated, nonexistent="raise")
    wide = frame[list(ZONES)].assign(hour_start_utc=start.dt.tz_convert("UTC"))
    long = wide.melt(id_vars="hour_start_utc", var_name="weather_zone", value_name="load_mw")
    return long[["weather_zone", "hour_start_utc", "load_mw"]].astype({"load_mw": float})


def zone_peaks(long: pd.DataFrame) -> pd.DataFrame:
    local = long["hour_start_utc"].dt.tz_convert("America/Chicago")
    frame = long.assign(year=local.dt.year, month=local.dt.month)
    grouped = frame.groupby(["weather_zone", "year"])
    out = grouped["load_mw"].apply(lambda s: s.nlargest(100).mean()).rename("top100_mean_mw").to_frame()
    out["summer_peak_mw"] = frame[frame["month"].isin(SUMMER)].groupby(["weather_zone", "year"])["load_mw"].max()
    out["winter_peak_mw"] = frame[frame["month"].isin(WINTER)].groupby(["weather_zone", "year"])["load_mw"].max()
    return out.reset_index()[["weather_zone", "year", "summer_peak_mw", "winter_peak_mw", "top100_mean_mw"]]


def fallback_peaks(
    grid: pd.DataFrame,
    crosswalk: pd.DataFrame,
    county_zones: pd.DataFrame,
    peaks: pd.DataFrame,
    year: int = PEAK_YEAR,
) -> pd.DataFrame:
    """Utilities with no EIA peak get each zone's peak times their share of that zone's customers."""
    ercot = crosswalk.loc[crosswalk["grid"] == "ERCOT", ["county_fips", "utility_id", "customers_est"]]
    ercot = ercot.merge(county_zones[["county_fips", "weather_zone"]], on="county_fips")
    per_zone = ercot.groupby("weather_zone")["customers_est"].sum()
    share = ercot.groupby(["utility_id", "weather_zone"], as_index=False)["customers_est"].sum()
    share["share"] = share["customers_est"] / share["weather_zone"].map(per_zone)
    year_peaks = peaks.loc[peaks["year"] == year].set_index("weather_zone")
    share["summer"] = share["share"] * share["weather_zone"].map(year_peaks["summer_peak_mw"])
    share["winter"] = share["share"] * share["weather_zone"].map(year_peaks["winter_peak_mw"])
    estimate = share.groupby("utility_id")[["summer", "winter"]].sum()

    out = grid.copy()
    missing = out["summer_peak_mw"].isna() & out["utility_id"].isin(estimate.index)
    ids = out.loc[missing, "utility_id"]
    out.loc[missing, "summer_peak_mw"] = ids.map(estimate["summer"]).to_numpy()
    out.loc[missing, "winter_peak_mw"] = ids.map(estimate["winter"]).to_numpy()
    out.loc[missing, "peak_source"] = "ercot_zone_estimate"
    return out


def _zip_path(year: int) -> Path:
    return RAW / Path(ARCHIVES[year]).name


def download() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    for year, part in ARCHIVES.items():
        path = _zip_path(year)
        if path.exists():
            continue
        request = urllib.request.Request(f"https://www.ercot.com/files/docs/{part}",
                                         headers={"User-Agent": "porchlight-hackathon utility map"})
        with urllib.request.urlopen(request, timeout=120) as response:
            path.write_bytes(response.read())
        print(f"downloaded {path.name}")


def main(argv: list[str]) -> int:
    if argv[:1] == ["download"]:
        download()
        return 0
    frames = []
    for year in ARCHIVES:
        with zipfile.ZipFile(_zip_path(year)) as archive:
            with archive.open(archive.namelist()[0]) as handle:
                frames.append(parse_native_load(pd.read_excel(handle)))
    long = pd.concat(frames, ignore_index=True)
    duplicates = long.duplicated(["weather_zone", "hour_start_utc"]).sum()
    if duplicates:
        raise ValueError(f"{duplicates} duplicate zone-hours after UTC conversion")
    peaks = zone_peaks(long)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    long.to_parquet(OUT_DIR / "zone_load.parquet", index=False)
    peaks.to_parquet(OUT_DIR / "zone_peaks.parquet", index=False)

    grid_path = OUT_DIR / "utility_grid.parquet"
    crosswalk = pd.read_csv(settings.COUNTY_UTILITY_CSV, dtype={"county_fips": str})
    zones = pd.read_csv(settings.COUNTY_WEATHER_ZONE_CSV, dtype={"county_fips": str})
    grid = fallback_peaks(pd.read_parquet(grid_path), crosswalk, zones, peaks)
    grid.to_parquet(grid_path, index=False)

    record("ercot_native_load", PAGE, *[_zip_path(y) for y in ARCHIVES], rows=len(long),
           period_start=f"{min(ARCHIVES)}-01-01", period_end=f"{max(ARCHIVES)}-12-31",
           note="Hourly native load by weather zone; hour-ending Central converted to UTC hour start.")
    estimated = (grid["peak_source"] == "ercot_zone_estimate").sum()
    print(f"{len(long):,} zone-hours; {len(peaks)} zone-years; {estimated} utilities got an estimated peak")
    print(peaks.loc[peaks["year"] == PEAK_YEAR].round(0).to_string(index=False))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
