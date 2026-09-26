"""The household backup gap: expected hours a year a home is dark with 0, 1 or 2 Cores.

Run: python -m pipeline.household_gap   (after pipeline.durations and pipeline.features; stop `make api`)

For each county and season:
  lambda   outages per home per year: each past outage adds homes affected / customers /
           years of data, scaled by the zone shrinkage used for the outlook (90% interval too)
  D        outage duration: a mixture over the county's own outages of the Weibull model
           (pipeline.durations) at each outage's severity, storm type, season and zone,
           weighted by that outage's share of lambda
Then, for backup hours T (the season's typical-home hours for 1 or 2 Cores, from full or
from the 20% reserve):
  dark hours a year   = sum over seasons of lambda * E[max(D - T, 0)]
  chance of a gap     = 1 - exp(-sum of lambda * P(D > T))
The browser repeats the last step with the home's own appliances, using the per-season
lambda and survival curves (on GRID_HOURS) stored here, so the appliance list never leaves the device.
"""
from __future__ import annotations

import json
import sys

import duckdb
import numpy as np
import pandas as pd

from pipeline import settings
from pipeline.durations import SEASONS, WeibullAFT, season_of, severity_of
from pipeline.hazards import label_hazards
from pipeline.outlook import shrink_rates

SEASON_MONTHS = {"winter": (12, 1, 2), "spring": (3, 4, 5), "summer": (6, 7, 8), "fall": (9, 10, 11)}
# Survival curves are stored on this grid; the browser integrates the same points.
GRID_HOURS = np.round(np.geomspace(0.25, 3000.0, 120), 3)


def load_model(path=settings.DURATION_MODEL_JSON) -> WeibullAFT:
    spec = json.loads(path.read_text())["model"]
    model = WeibullAFT({k: tuple(v) for k, v in spec["levels"].items()}, spec["scale_factor"])
    model.beta, model.gamma = np.array(spec["beta"]), np.array(spec["gamma"])
    return model


def mixture_survival(model: WeibullAFT, outages: pd.DataFrame) -> np.ndarray:
    """P(D > t) on GRID_HOURS for the mixture over `outages`
    (columns severity, hazard, season, weather_zone, weight)."""
    mu, sigma = model.params(outages)
    w = outages["weight"].to_numpy(float)
    w = w / w.sum()
    k, scale = 1.0 / sigma, np.exp(mu)
    return (w[:, None] * np.exp(-(GRID_HOURS[None, :] / scale[:, None]) ** k[:, None])).sum(axis=0)


def survival_at(survival: np.ndarray, hours: float) -> float:
    """P(D > hours), interpolating in log hours; 1 below the grid, 0 above it."""
    if hours <= GRID_HOURS[0]:
        return 1.0
    return float(np.interp(np.log(hours), np.log(GRID_HOURS), survival, right=0.0))


def expected_excess(survival: np.ndarray, hours: float) -> float:
    """E[max(D - T, 0)] = area under the survival curve beyond T (trapezoids on the grid)."""
    if hours < GRID_HOURS[0]:
        # Below the first grid point the curve is taken as 1.
        return float(GRID_HOURS[0] - hours) + float(np.trapezoid(survival, GRID_HOURS))
    beyond = GRID_HOURS > hours
    t = np.concatenate([[hours], GRID_HOURS[beyond]])
    curve = np.concatenate([[survival_at(survival, hours)], survival[beyond]])
    return float(np.trapezoid(curve, t))


def quantile_from_survival(survival: np.ndarray, q: float) -> float:
    """Hours by which a share q of affected homes are back."""
    return float(np.interp(1.0 - q, survival[::-1], GRID_HOURS[::-1]))


def gap(seasons: list[dict], backup_by_season: dict[str, float]) -> tuple[float, float]:
    """(expected dark hours a year, chance of at least one outage longer than the backup)."""
    hours = sum(x["outages_per_year"] * expected_excess(np.array(x["survival"]), backup_by_season[x["season"]])
                for x in seasons)
    rate = sum(x["outages_per_year"] * survival_at(np.array(x["survival"]), backup_by_season[x["season"]])
               for x in seasons)
    return hours, 1.0 - float(np.exp(-rate))


def outage_weights(events: pd.DataFrame, years: pd.Series, zones: pd.Series) -> pd.DataFrame:
    """Each outage's contribution to its county's outages per home per year, after zone shrinkage.

    Adds columns weight, weight_lo, weight_hi. events need county_fips, peak_out, customers.
    """
    contribution = events["peak_out"] / events["customers"] / events["county_fips"].map(years)
    raw = contribution.groupby(events["county_fips"]).sum()
    totals = raw * years.reindex(raw.index)
    scale = {}
    zone_of = zones.reindex(raw.index)
    for _, idx in zone_of.groupby(zone_of).groups.items():
        post, lo, hi = shrink_rates(totals.loc[idx], years.loc[idx])
        for fips, p, l, h, r in zip(idx, post, lo, hi, raw.loc[idx], strict=True):
            scale[fips] = (p / r, l / r, h / r) if r > 0 else (0.0, 0.0, 0.0)
    factors = pd.DataFrame(scale, index=["mid", "lo", "hi"]).T
    f = factors.reindex(events["county_fips"]).to_numpy()
    return events.assign(weight=contribution.to_numpy() * f[:, 0], weight_lo=contribution.to_numpy() * f[:, 1],
                         weight_hi=contribution.to_numpy() * f[:, 2])


def main() -> int:
    model = load_model()
    with duckdb.connect(str(settings.FEATURES_DUCKDB), read_only=True) as con:
        events = con.execute("""select id, county_fips, start, "end", storm, peak_out, peak_out_pct from events_texas""").df()
        outlook = con.execute("select county_fips, years_of_data from outlook").df().set_index("county_fips")
        zones = con.execute("select county_fips, weather_zone from county_info").df().set_index("county_fips")["weather_zone"]
        monthly = con.execute("select weather_zone, profile_type, mode, cores, month, hours from backup_zone_monthly").df()
    events["customers"] = events["peak_out"] * 100.0 / events["peak_out_pct"]
    events["hazard"] = label_hazards(events, pd.read_parquet(settings.STORM_EVENTS_PARQUET))
    events["season"] = [season_of(pd.Timestamp(s).tz_convert("America/Chicago").month) for s in events["start"]]
    events["severity"] = [severity_of(float(p)) for p in events["peak_out_pct"]]
    events["weather_zone"] = events["county_fips"].map(zones)
    events = outage_weights(events, outlook["years_of_data"], zones)

    season_rows, gap_rows = [], []
    for fips, part in events.groupby("county_fips"):
        zone = zones[fips]
        seasons = []
        for season in SEASONS:
            s = part.loc[part["season"] == season]
            surv = mixture_survival(model, s) if len(s) else np.zeros(len(GRID_HOURS))
            seasons.append({"season": season, "outages_per_year": float(s["weight"].sum()),
                            "outages_lo": float(s["weight_lo"].sum()), "outages_hi": float(s["weight_hi"].sum()),
                            "p50_hours": quantile_from_survival(surv, 0.5) if len(s) else None,
                            "p90_hours": quantile_from_survival(surv, 0.9) if len(s) else None,
                            "survival": np.round(surv, 5).tolist()})
        season_rows.append({"county_fips": fips, "seasons": json.dumps(seasons)})
        for profile in settings.PROFILE_TYPES:
            m = monthly.loc[(monthly["weather_zone"] == zone) & (monthly["profile_type"] == profile)]
            row = {"county_fips": fips, "profile_type": profile}
            row["dark_hours_0"], _ = gap(seasons, {name: 0.0 for name in SEASONS})
            for mode, start in (("normal", "full"), ("surprise", "reserve")):
                for cores in (1, 2):
                    sel = m.loc[(m["mode"] == mode) & (m["cores"] == cores)]
                    by_season = {name: float(sel.loc[sel["month"].isin(months), "hours"].mean())
                                 for name, months in SEASON_MONTHS.items()}
                    hours, chance = gap(seasons, by_season)
                    row[f"dark_hours_{cores}_{start}"] = hours
                    row[f"gap_chance_{cores}_{start}"] = chance
            total = max(sum(x["outages_per_year"] for x in seasons), 1e-12)
            row["interval_scale"] = json.dumps([round(sum(x["outages_lo"] for x in seasons) / total, 3),
                                                round(sum(x["outages_hi"] for x in seasons) / total, 3)])
            gap_rows.append(row)

    gaps, seasons_table = pd.DataFrame(gap_rows), pd.DataFrame(season_rows)
    with duckdb.connect(str(settings.FEATURES_DUCKDB)) as con:
        for name, frame in (("household_gap", gaps), ("household_gap_seasons", seasons_table)):
            con.register("frame", frame)
            con.execute(f"CREATE OR REPLACE TABLE {name} AS SELECT * FROM frame")
            con.unregister("frame")
    demo = gaps.loc[gaps["county_fips"].isin(settings.DEMO_FIPS)]
    cols = ["county_fips", "profile_type", "dark_hours_0", "dark_hours_1_full", "dark_hours_2_full",
            "dark_hours_1_reserve", "gap_chance_1_full", "gap_chance_2_full"]
    print(demo[cols].to_string(index=False, float_format=lambda v: f"{v:.3f}"))
    print(f"wrote household_gap ({len(gaps)}) and household_gap_seasons ({len(seasons_table)})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
