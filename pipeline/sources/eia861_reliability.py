"""EIA-861 reliability: SAIDI with and without major event days for Texas wires utilities.

Run: python -m pipeline.sources.eia861_reliability   (downloads f861YYYY.zip into data/raw/eia861)

Writes data/processed/eia861_reliability.csv. Utilities report under the IEEE 1366
standard or an "Other" standard (Oncor and TNMP use Other), so each row keeps the
standard it came from. Column positions move between years (2019-2020 have a
two-row header and a Short Form column), so columns are found by their labels.
"""
from __future__ import annotations

import io
import sys
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

from pipeline import settings

CURRENT_URL = "https://www.eia.gov/electricity/data/eia861/zip/f861{year}.zip"
ARCHIVE_URL = "https://www.eia.gov/electricity/data/eia861/archive/zip/f861{year}.zip"
SHEET = "Reliability_States"
STANDARDS = ("IEEE", "Other")


def zip_path(year: int, directory: Path = settings.RAW_EIA861_DIR) -> Path:
    return directory / f"f861{year}.zip"


def fetch_year(year: int, directory: Path = settings.RAW_EIA861_DIR) -> Path:
    """Download one year's zip. EIA moves older years to an archive path."""
    path = zip_path(year, directory)
    if path.exists() and zipfile.is_zipfile(path):
        return path
    directory.mkdir(parents=True, exist_ok=True)
    for url in (CURRENT_URL.format(year=year), ARCHIVE_URL.format(year=year)):
        with urllib.request.urlopen(url, timeout=120) as response:
            body = response.read()
        if body[:2] == b"PK":
            path.write_bytes(body)
            return path
    raise FileNotFoundError(f"no EIA-861 zip for {year} at the current or archive URL")


def column_labels(raw: pd.DataFrame) -> tuple[list[str], int]:
    """One "standard|group|name" label per column, and the index of the last header row."""
    header_row = next(i for i in range(6) if "Utility Name" in raw.iloc[i].astype(str).tolist())
    section = raw.iloc[0].where(raw.iloc[0].notna()).ffill().fillna("").astype(str)
    group = (raw.iloc[1].where(raw.iloc[1].notna()).ffill().fillna("").astype(str)
             if header_row == 2 else pd.Series([""] * raw.shape[1]))
    names = raw.iloc[header_row].fillna("").astype(str)
    labels = []
    for sec, grp, name in zip(section, group, names, strict=True):
        standard = "IEEE" if "IEEE" in sec else "Other" if "Other" in sec else ""
        labels.append(f"{standard}|{grp}|{name}")
    return labels, header_row


def _find(labels: list[str], standard: str, with_med: bool, metric: str = "SAIDI") -> int:
    for i, label in enumerate(labels):
        std, group, name = label.split("|")
        if std != standard or metric not in name:
            continue
        text = f"{group} {name}"
        if "Loss of Supply" in text or "Minus LOS" in text:
            continue
        without = "Without" in text
        if with_med and not without and ("With MED" in text or "All Events" in text):
            return i
        if not with_med and without:
            return i
    raise ValueError(f"no {standard} {metric} {'with' if with_med else 'without'} MED column")


def _customers(labels: list[str], standard: str) -> int:
    for i, label in enumerate(labels):
        std, _, name = label.split("|")
        if std == standard and "Number of Customers" in name:
            return i
    raise ValueError(f"no {standard} customer column")


def _number(value) -> float:
    number = pd.to_numeric(value, errors="coerce")
    return float(number) if pd.notna(number) else float("nan")


def reliability_rows(raw: pd.DataFrame, year: int, utilities: dict[int, str]) -> pd.DataFrame:
    """Texas rows for `utilities`, IEEE figures when reported, else Other."""
    labels, header_row = column_labels(raw)
    names = [label.split("|")[2] for label in labels]
    number_col, state_col = names.index("Utility Number"), names.index("State")
    cols = {std: (_find(labels, std, True), _find(labels, std, False), _customers(labels, std)) for std in STANDARDS}
    body = raw.iloc[header_row + 1:]
    rows = []
    for _, row in body.iterrows():
        number = _number(row.iloc[number_col])
        if row.iloc[state_col] != "TX" or np.isnan(number) or int(number) not in utilities:
            continue
        for std in STANDARDS:
            with_col, without_col, customers_col = cols[std]
            with_med, without_med = _number(row.iloc[with_col]), _number(row.iloc[without_col])
            if not np.isnan(with_med) and not np.isnan(without_med):
                rows.append({
                    "year": year, "utility_number": int(number), "utility": utilities[int(number)],
                    "standard": std, "customers": _number(row.iloc[customers_col]),
                    "saidi_with_med": with_med, "saidi_without_med": without_med,
                })
                break
    return pd.DataFrame(rows)


def read_year(year: int, directory: Path = settings.RAW_EIA861_DIR,
              utilities: dict[int, str] = settings.EIA861_UTILITIES) -> pd.DataFrame:
    with zipfile.ZipFile(zip_path(year, directory)) as archive:
        name = next(n for n in archive.namelist() if n.lower().startswith("reliability"))
        raw = pd.read_excel(io.BytesIO(archive.read(name)), sheet_name=SHEET, header=None)
    return reliability_rows(raw, year, utilities)


def med_share(table: pd.DataFrame) -> pd.DataFrame:
    """Per utility over all years: minutes with and without major event days, and the share removed."""
    totals = table.groupby("utility")[["saidi_with_med", "saidi_without_med"]].sum()
    totals["share_removed"] = 1.0 - totals["saidi_without_med"] / totals["saidi_with_med"]
    return totals.sort_values("share_removed", ascending=False)


def main() -> int:
    frames = []
    for year in settings.EIA861_YEARS:
        fetch_year(year)
        frames.append(read_year(year))
    table = pd.concat(frames, ignore_index=True).sort_values(["utility", "year"])
    missing = sorted(set(settings.EIA861_UTILITIES.values()) - set(table["utility"]))
    if missing:
        print(f"no reliability rows for {', '.join(missing)}")
    settings.EIA861_CSV.parent.mkdir(parents=True, exist_ok=True)
    table.to_csv(settings.EIA861_CSV, index=False)
    print(table.pivot(index="utility", columns="year", values="saidi_with_med").round(0).to_string())
    summary = med_share(table)
    print(f"\n{settings.EIA861_YEARS[0]}-{settings.EIA861_YEARS[-1]} SAIDI minutes per customer")
    print(summary.round(2).to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main())
