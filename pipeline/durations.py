"""How long outages last: a Weibull duration model by storm type, season and weather zone.

Run: python -m pipeline.durations   (after pipeline.features; needs the raw EAGLE-I CSVs)

Each outage contributes its per-home durations under the stay bound (pipeline.events),
compressed to QUANTILES weighted points carrying the homes affected. The model is a
weighted Weibull accelerated-failure-time regression:
    log D = x.beta + sigma(hazard) * W,   W ~ standard minimum-Gumbel,
with x = intercept + severity + hazard + season + weather zone, and sigma by severity.
Severity is the share of the county out at the outage's peak: without it one curve has to
cover everyday outages and catastrophes, and the heavy tail (where the dark hours are) is
flattened. The backtest fits 2018-2022 and scores 2023-2024 by log-likelihood per home
against the model without severity, a zone-only Weibull and a pooled one.
Writes data/processed/duration_model.json and the duration_model_backtest block.
"""
from __future__ import annotations

import json
import sys
import time

import duckdb
import numpy as np
import pandas as pd
from scipy.optimize import minimize

from pipeline import settings
from pipeline.events import bridged, layer_durations, weighted_quantile
from pipeline.hazards import HAZARDS, label_hazards
from pipeline.statewide import texas_series

QUANTILES = 10
SEASONS = ("winter", "spring", "summer", "fall")
MIN_HOURS = 0.25
TRAIN = (2018, 2022)
TEST = (2023, 2024)
REPORT_QS = (0.5, 0.9)
# Share of the county's customers out at the outage's peak, percent; upper bin edges.
SEVERITY_EDGES = (0.1, 1.0, 3.0, 10.0, 30.0)
SEVERITIES = ("<0.1%", "0.1-1%", "1-3%", "3-10%", "10-30%", ">30%")


def severity_of(peak_pct: float) -> str:
    """Severity bin for a peak share of customers out, in percent."""
    return SEVERITIES[int(np.searchsorted(SEVERITY_EDGES, peak_pct, side="right"))]


def season_of(month: int) -> str:
    return SEASONS[(month % 12) // 3]


def compress(durations: np.ndarray, weights: np.ndarray, k: int = QUANTILES) -> tuple[np.ndarray, float]:
    """k weighted-quantile durations standing in for the event's homes, and the homes each carries."""
    qs = (np.arange(k) + 0.5) / k
    points = np.array([weighted_quantile(durations, weights, q) for q in qs])
    return np.maximum(points, MIN_HOURS), float(weights.sum()) / k


def duration_samples(events: pd.DataFrame, series: dict[str, pd.Series]) -> pd.DataFrame:
    """One row per compressed duration point. events: id, county_fips, start, end, hazard, weather_zone, peak_out_pct."""
    rows = []
    for fips, group in events.groupby("county_fips"):
        grid = bridged(series[fips])
        for event in group.itertuples(index=False):
            window = grid.loc[event.start: event.end - pd.Timedelta(minutes=15)].to_numpy(dtype=float)
            if window.size == 0 or np.isnan(window).any():
                continue
            d, w = layer_durations(window)
            if w.sum() <= 0:
                continue
            points, homes = compress(d, w)
            local = pd.Timestamp(event.start).tz_convert("America/Chicago")
            severity = severity_of(float(event.peak_out_pct))
            for value in points:
                rows.append((event.id, fips, event.hazard, season_of(local.month), event.weather_zone,
                             severity, local.year, float(value), homes))
    return pd.DataFrame(rows, columns=["id", "county_fips", "hazard", "season", "weather_zone", "severity",
                                       "year", "hours", "homes"])


class WeibullAFT:
    """Weighted Weibull AFT with a location from `levels` factors and a scale per `scale_factor` level."""

    def __init__(self, levels: dict[str, tuple[str, ...]], scale_factor: str | None = "hazard"):
        self.levels = levels
        self.scale_factor = scale_factor
        self.beta: np.ndarray | None = None
        self.gamma: np.ndarray | None = None

    def _design(self, frame: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        cols = [np.ones(len(frame))]
        for factor, values in self.levels.items():
            cols += [(frame[factor].to_numpy() == v).astype(float) for v in values[1:]]
        x = np.column_stack(cols)
        if self.scale_factor is None:
            h = np.ones((len(frame), 1))
        else:
            values = self.levels[self.scale_factor]
            h = np.column_stack([(frame[self.scale_factor].to_numpy() == v).astype(float) for v in values])
        return x, h

    @staticmethod
    def _nll(params: np.ndarray, x: np.ndarray, h: np.ndarray, logd: np.ndarray, w: np.ndarray) -> tuple[float, np.ndarray]:
        p = x.shape[1]
        beta, gamma = params[:p], params[p:]
        mu, log_sigma = x @ beta, h @ gamma
        sigma = np.exp(log_sigma)
        z = (logd - mu) / sigma
        ez = np.exp(np.clip(z, -50, 50))
        ll = -log_sigma - logd + z - ez
        d_mu = (ez - 1.0) / sigma
        d_ls = -1.0 - z + z * ez
        grad = -np.concatenate([x.T @ (w * d_mu), h.T @ (w * d_ls)])
        return float(-(w * ll).sum()), grad

    def fit(self, frame: pd.DataFrame) -> WeibullAFT:
        x, h = self._design(frame)
        logd = np.log(frame["hours"].to_numpy())
        w = frame["homes"].to_numpy()
        w = w / w.mean()
        start = np.concatenate([[logd.mean()], np.zeros(x.shape[1] - 1), np.zeros(h.shape[1])])
        result = minimize(self._nll, start, args=(x, h, logd, w), jac=True, method="L-BFGS-B")
        if not result.success:
            raise RuntimeError(f"Weibull fit failed: {result.message}")
        self.beta, self.gamma = result.x[: x.shape[1]], result.x[x.shape[1]:]
        return self

    def params(self, frame: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
        """(mu, sigma) of log duration for each row."""
        x, h = self._design(frame)
        return x @ self.beta, np.exp(h @ self.gamma)

    def mean_loglik(self, frame: pd.DataFrame) -> float:
        """Log-likelihood per home affected (weighted mean over points)."""
        mu, sigma = self.params(frame)
        logd = np.log(frame["hours"].to_numpy())
        z = (logd - mu) / sigma
        ll = -np.log(sigma) - logd + z - np.exp(z)
        w = frame["homes"].to_numpy()
        return float((w * ll).sum() / w.sum())

    def quantile(self, frame: pd.DataFrame, q: float) -> np.ndarray:
        mu, sigma = self.params(frame)
        return np.exp(mu + sigma * np.log(-np.log(1.0 - q)))

    def to_dict(self) -> dict:
        return {"levels": {k: list(v) for k, v in self.levels.items()}, "scale_factor": self.scale_factor,
                "beta": self.beta.round(6).tolist(), "gamma": self.gamma.round(6).tolist()}


CHOSEN = "severity_hazard_season_zone"


def models() -> dict[str, WeibullAFT]:
    zones = tuple(settings.WEATHER_ZONES)
    return {
        "severity_hazard_season_zone": WeibullAFT(
            {"severity": SEVERITIES, "hazard": HAZARDS, "season": SEASONS, "weather_zone": zones},
            scale_factor="severity"),
        "hazard_season_zone": WeibullAFT({"hazard": HAZARDS, "season": SEASONS, "weather_zone": zones}),
        "zone_only": WeibullAFT({"weather_zone": zones}, scale_factor=None),
        "pooled": WeibullAFT({}, scale_factor=None),
    }


def calibration(model: WeibullAFT, test: pd.DataFrame) -> list[dict]:
    """Predicted vs observed p50 and p90 per home, by hazard, on the test years."""
    rows = []
    for hazard, part in test.groupby("hazard"):
        row = {"hazard": hazard, "homes": round(float(part["homes"].sum()))}
        for q in REPORT_QS:
            predicted = weighted_quantile(model.quantile(part, q), part["homes"].to_numpy(), 0.5)
            observed = weighted_quantile(part["hours"].to_numpy(), part["homes"].to_numpy(), q)
            row[f"p{int(q * 100)}_predicted"] = round(float(predicted), 1)
            row[f"p{int(q * 100)}_observed"] = round(float(observed), 1)
        rows.append(row)
    return rows


def main() -> int:
    started = time.perf_counter()
    with duckdb.connect(str(settings.FEATURES_DUCKDB), read_only=True) as con:
        events = con.execute("""
            select e.id, e.county_fips, e.start, e."end", e.storm, e.peak_out_pct, i.weather_zone
            from events_texas e join county_info i using (county_fips)
        """).df()
    events["hazard"] = label_hazards(events, pd.read_parquet(settings.STORM_EVENTS_PARQUET))
    series = texas_series(sorted(events["county_fips"].unique()))
    samples = duration_samples(events, series)
    samples.to_parquet(settings.DURATION_SAMPLES_PARQUET, index=False)
    print(f"{samples['id'].nunique():,} outages, {len(samples):,} duration points in "
          f"{time.perf_counter() - started:.0f} s", flush=True)

    train = samples.loc[samples["year"].between(*TRAIN)]
    test = samples.loc[samples["year"].between(*TEST)]
    scores = {}
    for name, model in models().items():
        model.fit(train)
        scores[name] = round(model.mean_loglik(test), 4)
    chosen = models()[CHOSEN].fit(train)
    backtest = {"train": list(TRAIN), "test": list(TEST), "metric": "log-likelihood per home affected (higher is better)",
                "scores": scores, "calibration": calibration(chosen, test)}
    final = models()[CHOSEN].fit(samples)
    settings.DURATION_MODEL_JSON.write_text(json.dumps(
        {"model": final.to_dict(), "quantity": "per-home outage hours, stay bound", "backtest": backtest}, indent=2) + "\n")
    print(json.dumps(backtest, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
