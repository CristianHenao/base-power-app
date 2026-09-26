"""Read yearly EAGLE-I CSVs into per-county outage events.

Column names are passed in. Nothing here guesses the real file's header.
"""
from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from pipeline import settings
from pipeline.events import EventConfig, customers_floor, extract_events

NORMALIZED_COLUMNS = ("county_fips", "state", "customers_out", "timestamp")

EVENT_COLUMNS = (
    "county_fips",
    "start",
    "end",
    "peak_out",
    "peak_out_pct",
    "customer_hours",
    "p50_h_rotate",
    "p90_h_rotate",
    "share_12h_rotate",
    "p50_h_stay",
    "p90_h_stay",
    "share_12h_stay",
)


@dataclass(frozen=True)
class EagleiColumns:
    """Header names for one EAGLE-I yearly CSV, mapped onto the normalized frame."""

    fips: str
    state: str
    customers_out: str
    timestamp: str

    def names(self) -> tuple[str, str, str, str]:
        return (self.fips, self.state, self.customers_out, self.timestamp)


def columns_from_settings() -> EagleiColumns | None:
    """Return the reviewed header map, or None when it has not been set."""
    names = (
        settings.EAGLEI_FIPS_COL,
        settings.EAGLEI_STATE_COL,
        settings.EAGLEI_CUSTOMERS_OUT_COL,
        settings.EAGLEI_TIMESTAMP_COL,
    )
    if all(name is None for name in names):
        return None
    if any(name is None for name in names):
        raise ValueError("EAGLE-I column map in pipeline/settings.py is only partly set")
    fips, state, customers_out, timestamp = names
    return EagleiColumns(str(fips), str(state), str(customers_out), str(timestamp))


def _normalize_fips(values: pd.Series) -> pd.Series:
    text = values.astype("string").str.strip()
    text = text.str.replace(r"\.0$", "", regex=True)
    return text.str.zfill(5)


def _one_fips(county_fips: str) -> str:
    return str(_normalize_fips(pd.Series([county_fips], dtype="string")).iloc[0])


# 2023 renamed the outage count. Later years went back to customers_out.
CUSTOMERS_OUT_ALIASES = ("sum",)


def _customers_out_source(header: pd.Index, columns: EagleiColumns) -> str:
    if columns.customers_out in header:
        return columns.customers_out
    for alias in CUSTOMERS_OUT_ALIASES:
        if alias in header:
            return alias
    return columns.customers_out


def read_yearly_csv(path: Path, columns: EagleiColumns) -> pd.DataFrame:
    """Read one yearly CSV into county_fips, state, customers_out, timestamp (UTC)."""
    header = pd.read_csv(path, nrows=0).columns
    customers_out = _customers_out_source(header, columns)
    needed = {
        columns.fips: columns.fips,
        columns.state: columns.state,
        columns.customers_out: customers_out,
        columns.timestamp: columns.timestamp,
    }
    missing = [name for name, source in needed.items() if source not in header]
    if missing:
        raise ValueError(f"{path.name} is missing columns: {', '.join(missing)}")
    frame = pd.read_csv(
        path,
        usecols=list(dict.fromkeys(needed.values())),
        dtype={columns.fips: "string", columns.state: "string"},
    )
    out = pd.DataFrame(
        {
            "county_fips": _normalize_fips(frame[columns.fips]),
            "state": frame[columns.state].astype("string"),
            "customers_out": pd.to_numeric(frame[customers_out], errors="coerce"),
            "timestamp": pd.to_datetime(frame[columns.timestamp], utc=True),
        }
    )
    return out.dropna(subset=["county_fips", "customers_out", "timestamp"]).reset_index(drop=True)


def list_yearly_csvs(raw_dir: Path) -> list[Path]:
    if not raw_dir.is_dir():
        return []
    return sorted(path for path in raw_dir.glob("*.csv") if path.is_file())


def concat_yearly(paths: list[Path], columns: EagleiColumns) -> pd.DataFrame:
    if not paths:
        return pd.DataFrame(columns=list(NORMALIZED_COLUMNS))
    return pd.concat([read_yearly_csv(path, columns) for path in paths], ignore_index=True)


def keep_texas(frame: pd.DataFrame) -> pd.DataFrame:
    """Keep rows whose county FIPS starts with 48."""
    fips = frame["county_fips"].astype("string")
    return frame.loc[fips.str.startswith("48")].reset_index(drop=True)


def keep_from(frame: pd.DataFrame, start: pd.Timestamp) -> pd.DataFrame:
    """Keep timestamps at or after `start`. Naive timestamps are read as UTC."""
    start = pd.Timestamp(start)
    if start.tzinfo is None:
        start = start.tz_localize("UTC")
    else:
        start = start.tz_convert("UTC")
    return frame.loc[frame["timestamp"] >= start].reset_index(drop=True)


def county_series(frame: pd.DataFrame, county_fips: str) -> pd.Series:
    """Customers-out series for one county, indexed by UTC timestamp."""
    fips = _one_fips(county_fips)
    part = frame.loc[frame["county_fips"] == fips, ["timestamp", "customers_out"]]
    part = part.sort_values("timestamp").drop_duplicates("timestamp", keep="last")
    series = part.set_index("timestamp")["customers_out"].astype(float)
    series.index.name = None
    return series


def events_frame(
    series_by_fips: dict[str, pd.Series],
    customers_by_fips: dict[str, float],
    cfg: EventConfig = EventConfig(),
) -> pd.DataFrame:
    """Run extract_events for each county and attach county_fips.

    Every county needs a positive modeled customer count. EAGLE-I does not carry one.
    """
    missing = sorted(fips for fips in series_by_fips if fips not in customers_by_fips)
    if missing:
        joined = ", ".join(missing)
        raise ValueError(
            f"no modeled customer count for {joined}; "
            "pass customers_by_fips from the reference file"
        )
    rows: list[dict] = []
    for fips, series in series_by_fips.items():
        modeled = float(customers_by_fips[fips])
        if modeled <= 0:
            raise ValueError(f"modeled customers for {fips} must be positive")
        total = customers_floor(modeled, series)
        for event in extract_events(series, total, cfg):
            rows.append({"county_fips": fips, **event})
    return pd.DataFrame(rows, columns=list(EVENT_COLUMNS))


def write_events(frame: pd.DataFrame, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(path, index=False)
    return path


def top_events(frame: pd.DataFrame, n: int = 10) -> pd.DataFrame:
    """Largest events per county, ranked by customer-hours."""
    if frame.empty:
        return frame.copy()
    ranked = frame.sort_values(
        ["county_fips", "customer_hours"],
        ascending=[True, False],
    )
    return ranked.groupby("county_fips", sort=True).head(n).reset_index(drop=True)


def load_customers(path: Path) -> dict[str, float]:
    """Load modeled customers by county FIPS. Raises if the file is missing."""
    if not path.is_file():
        raise FileNotFoundError(
            f"modeled customer counts not found at {path}. "
            "peak_out_pct and the event threshold need this file; it is not in the EAGLE-I extract."
        )
    fips_col = settings.CUSTOMERS_FIPS_COL
    count_col = settings.CUSTOMERS_COUNT_COL
    header = pd.read_csv(path, nrows=0)
    missing = [name for name in (fips_col, count_col) if name not in header.columns]
    if missing:
        raise ValueError(f"{path.name} is missing columns: {', '.join(missing)}")
    frame = pd.read_csv(path, dtype={fips_col: "string"})
    fips = _normalize_fips(frame[fips_col])
    counts = pd.to_numeric(frame[count_col], errors="coerce")
    if counts.isna().any() or (counts <= 0).any():
        raise ValueError(f"{path.name} has a missing or non-positive customer count")
    return dict(zip(fips.tolist(), counts.astype(float).tolist(), strict=True))


def preview_csv(path: Path, rows: int = 5) -> str:
    frame = pd.read_csv(path, nrows=rows)
    header = ", ".join(map(str, frame.columns))
    return f"{header}\n{frame.to_string(index=False)}"


def build_events(
    raw_dir: Path,
    out_path: Path,
    columns: EagleiColumns,
    customers_by_fips: dict[str, float],
    fips: tuple[str, ...] = settings.DEMO_FIPS,
    start: pd.Timestamp | None = None,
    cfg: EventConfig = EventConfig(),
) -> pd.DataFrame:
    """Filter Texas rows from 2018 on, extract events for `fips`, and write parquet."""
    if start is None:
        start = pd.Timestamp(settings.RATES_START, tz="UTC")
    frame = keep_from(keep_texas(concat_yearly(list_yearly_csvs(raw_dir), columns)), start)
    series_by_fips = {_one_fips(code): county_series(frame, code) for code in fips}
    events = events_frame(series_by_fips, customers_by_fips, cfg)
    write_events(events, out_path)
    return events


def demo_series(
    raw_dir: Path = settings.RAW_EAGLEI_DIR,
    fips: tuple[str, ...] = settings.DEMO_FIPS,
) -> dict[str, pd.Series]:
    """Customers-out series from 2018 on for each county, read the way build_events reads them."""
    columns = columns_from_settings()
    if columns is None:
        raise RuntimeError("EAGLE-I column map in pipeline/settings.py is unset")
    start = pd.Timestamp(settings.RATES_START, tz="UTC")
    frame = keep_from(keep_texas(concat_yearly(list_yearly_csvs(raw_dir), columns)), start)
    return {_one_fips(code): county_series(frame, code) for code in fips}


def main() -> int:
    paths = list_yearly_csvs(settings.RAW_EAGLEI_DIR)
    if not paths:
        print(f"no EAGLE-I CSVs in {settings.RAW_EAGLEI_DIR}")
        return 0
    columns = columns_from_settings()
    if columns is None:
        print(f"{len(paths)} CSV(s) in {settings.RAW_EAGLEI_DIR}")
        print(preview_csv(paths[0]))
        print("column map is unset in pipeline/settings.py; parquet was not written")
        return 0
    customers = load_customers(settings.CUSTOMERS_CSV)
    events = build_events(
        settings.RAW_EAGLEI_DIR,
        settings.EVENTS_PARQUET,
        columns,
        customers,
    )
    print(top_events(events).to_string(index=False))
    print(f"wrote {len(events)} events to {settings.EVENTS_PARQUET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
