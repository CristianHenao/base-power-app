"""Static SVG charts for the README, the video and web/public/insights.

Run: python -m pipeline.charts   (after pipeline.backtest, pipeline.features, pipeline.insights)

Plain SVG with light and dark colors from the system setting. The web app draws its own
interactive charts from the same data; these are the exported versions.
"""
from __future__ import annotations

import json
import sys
from html import escape

import duckdb
import numpy as np
import pandas as pd

from pipeline import settings

WIDTH, HEIGHT = 720, 400
FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif"
MONTH_LETTERS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
# Base's typical-home figure for one Core (docs/battery-tech-specs.md). 36 h is its reduced-use claim.
BASE_TYPICAL_H = (12.0, 18.0)
PERSONAS = (("48085", "Collin, electric heat"), ("48201", "Harris, gas heat"), ("48453", "Travis, gas heat"))

STYLE = """<style>
  .surface { fill: #fcfcfb; } .ink { fill: #0b0b0b; } .ink2 { fill: #52514e; } .muted { fill: #7a7974; }
  .grid { stroke: #e5e4e0; stroke-width: 1; } .axis { stroke: #b8b7b1; stroke-width: 1; }
  .band { fill: #0b0b0b; fill-opacity: 0.06; }
  .s1 { fill: #2a78d6; stroke: #2a78d6; } .s2 { fill: #eb6834; stroke: #eb6834; } .s3 { fill: #1baf7a; stroke: #1baf7a; }
  .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .dot { stroke: #fcfcfb; stroke-width: 2; }
  text { font-family: %s; }
  @media (prefers-color-scheme: dark) {
    .surface { fill: #1a1a19; } .ink { fill: #ffffff; } .ink2 { fill: #c3c2b7; } .muted { fill: #9a998f; }
    .grid { stroke: #2e2e2c; } .axis { stroke: #4a4a46; } .band { fill: #ffffff; fill-opacity: 0.08; }
    .s1 { fill: #3987e5; stroke: #3987e5; } .s2 { fill: #d95926; stroke: #d95926; } .s3 { fill: #199e70; stroke: #199e70; }
    .dot { stroke: #1a1a19; }
  }
</style>""" % FONT


def _svg(title: str, subtitle: str, body: list[str], note: str) -> str:
    return "\n".join([
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" width="{WIDTH}" height="{HEIGHT}" '
        f'role="img" aria-labelledby="t d">',
        f"<title id=\"t\">{escape(title)}</title><desc id=\"d\">{escape(subtitle)} {escape(note)}</desc>",
        STYLE,
        f'<rect class="surface" width="{WIDTH}" height="{HEIGHT}" rx="8"/>',
        f'<text class="ink" x="24" y="34" font-size="17" font-weight="600">{escape(title)}</text>',
        f'<text class="ink2" x="24" y="56" font-size="13">{escape(subtitle)}</text>',
        *body,
        f'<text class="muted" x="24" y="{HEIGHT - 14}" font-size="11">{escape(note)}</text>',
        "</svg>",
    ]) + "\n"


def nice_max(value: float) -> float:
    """Smallest 1, 1.5, 2, 2.5 or 5 x 10^k at or above `value`."""
    if value <= 0:
        return 1.0
    power = 10 ** np.floor(np.log10(value))
    for step in (1, 1.5, 2, 2.5, 5, 10):
        if step * power >= value:
            return float(step * power)
    return float(10 * power)


def spread(ys: list[float], min_gap: float) -> list[float]:
    """Label y positions in input order, pushed apart to at least `min_gap`, keeping their order."""
    order = sorted(range(len(ys)), key=lambda i: ys[i])
    placed = list(ys)
    last = -1e9
    for i in order:
        placed[i] = max(ys[i], last + min_gap)
        last = placed[i]
    return placed


def backtest_svg(record: dict) -> str:
    """Horizontal bars of Poisson deviance by method. An infinite deviance is written, not drawn."""
    names = {
        "empirical_bayes": "Empirical Bayes (ours)", "zone_mean": "Weather-zone mean",
        "statewide_mean": "Statewide mean", "raw_rate": "County's own rate",
    }
    rows = [(names.get(key, key), value["poisson_deviance"]) for key, value in record["methods"].items()]
    finite = [float(v) for _, v in rows if v != "inf"]
    top = nice_max(max(finite))
    left, right, y0, bar_h, gap = 210, WIDTH - 80, 90, 34, 18
    body = []
    for tick in np.linspace(0, top, 5):
        x = left + (right - left) * tick / top
        body.append(f'<line class="grid" x1="{x:.1f}" y1="{y0 - 8}" x2="{x:.1f}" y2="{y0 + len(rows) * (bar_h + gap)}"/>')
        body.append(f'<text class="muted" x="{x:.1f}" y="{y0 + len(rows) * (bar_h + gap) + 16}" font-size="11" '
                    f'text-anchor="middle">{tick:,.0f}</text>')
    for i, (name, value) in enumerate(rows):
        y = y0 + i * (bar_h + gap)
        body.append(f'<text class="ink" x="{left - 12}" y="{y + bar_h / 2 + 5}" font-size="13" text-anchor="end">{escape(name)}</text>')
        if value == "inf":
            body.append(f'<text class="ink2" x="{left + 4}" y="{y + bar_h / 2 + 5}" font-size="13">infinite: '
                        f'{record["zero_train_counties_with_test_outages"]} counties had none in training, some in testing</text>')
            continue
        width = (right - left) * float(value) / top
        body.append(f'<path class="s1" d="M{left},{y} h{width - 4:.1f} a4,4 0 0 1 4,4 v{bar_h - 8} a4,4 0 0 1 -4,4 h{-(width - 4):.1f} z"/>')
        body.append(f'<text class="ink" x="{left + width + 8:.1f}" y="{y + bar_h / 2 + 5}" font-size="13">{float(value):,.0f}</text>')
    train, test = record["train"], record["test"]
    return _svg(
        "Outlook backtest: Poisson deviance, lower is better",
        f"Fit on {train[0][:4]}-{int(test[0][:4]) - 1}, scored on {test[0][:4]}-{int(test[1][:4]) - 1}, "
        f"{record['counties']} Texas counties, 12-hour-plus outages per typical home",
        body,
        "Source: EAGLE-I (ORNL) county outages; Porchlight pipeline/backtest.py. Estimates.",
    )


def month_svg(hours: dict[str, list[float]]) -> str:
    """One-Core backup hours by month for each persona, over Base's typical-home band."""
    left, right, top_y, bottom_y = 64, WIDTH - 170, 84, HEIGHT - 70
    top = nice_max(max(max(values) for values in hours.values()) * 1.05)
    x_at = lambda m: left + (right - left) * m / 11  # noqa: E731
    y_at = lambda h: bottom_y - (bottom_y - top_y) * h / top  # noqa: E731
    body = []
    for tick in np.linspace(0, top, 6):
        body.append(f'<line class="grid" x1="{left}" y1="{y_at(tick):.1f}" x2="{right}" y2="{y_at(tick):.1f}"/>')
        body.append(f'<text class="muted" x="{left - 8}" y="{y_at(tick) + 4:.1f}" font-size="11" text-anchor="end">{tick:.0f} h</text>')
    for m, name in enumerate(MONTH_LETTERS):
        body.append(f'<text class="muted" x="{x_at(m):.1f}" y="{bottom_y + 18}" font-size="11" text-anchor="middle">{name}</text>')
    low_h, high_h = BASE_TYPICAL_H
    body.insert(0, f'<rect class="band" x="{left}" y="{y_at(high_h):.1f}" width="{right - left}" '
                   f'height="{y_at(low_h) - y_at(high_h):.1f}"/>')
    # The band sits under the curves; its label goes at the bottom left, clear of every series.
    body.append(f'<text class="ink2" x="{left + 8}" y="{y_at(low_h) + 16:.1f}" font-size="12">'
                f'Shaded: Base says 12-18 h for a typical home</text>')
    label_y = spread([y_at(values[-1]) for values in hours.values()], min_gap=34)
    for i, (label, values) in enumerate(hours.items()):
        cls = f"s{i + 1}"
        points = " ".join(f"{x_at(m):.1f},{y_at(v):.1f}" for m, v in enumerate(values))
        body.append(f'<polyline class="line {cls}" points="{points}"/>')
        low = int(np.argmin(values))
        body.append(f'<circle class="dot {cls}" cx="{x_at(low):.1f}" cy="{y_at(values[low]):.1f}" r="4"/>')
        body.append(f'<circle class="{cls}" cx="{right + 16}" cy="{label_y[i] - 4:.1f}" r="5"/>')
        body.append(f'<text class="ink" x="{right + 26}" y="{label_y[i]:.1f}" font-size="12">{escape(label)}</text>')
        body.append(f'<text class="ink2" x="{right + 26}" y="{label_y[i] + 15:.1f}" font-size="11">'
                    f'low {values[low]:.0f} h in {MONTH_LETTERS[low]}</text>')
    return _svg(
        "Same Core, different month",
        "Hours one Core (39.2 kWh) lasts for a typical home, median day of each month, normal use",
        body,
        "Source: ERCOT 2024 backcasted load profiles; Porchlight simulator. Estimates; battery starts full.",
    )


def tail_svg(shares: pd.Series, demo: dict[str, str]) -> str:
    """Histogram of each county's top-5 share of event outage hours, demo counties marked."""
    left, right, top_y, bottom_y = 64, WIDTH - 40, 112, HEIGHT - 70
    edges = np.linspace(0.0, 1.0, 21)
    counts, _ = np.histogram(shares.dropna().clip(0, 1), bins=edges)
    top = nice_max(counts.max())
    x_at = lambda s: left + (right - left) * s  # noqa: E731
    y_at = lambda c: bottom_y - (bottom_y - top_y) * c / top  # noqa: E731
    body = []
    for tick in np.linspace(0, top, 6):
        body.append(f'<line class="grid" x1="{left}" y1="{y_at(tick):.1f}" x2="{right}" y2="{y_at(tick):.1f}"/>')
        body.append(f'<text class="muted" x="{left - 8}" y="{y_at(tick) + 4:.1f}" font-size="11" text-anchor="end">{tick:.0f}</text>')
    for share in np.linspace(0, 1, 6):
        body.append(f'<text class="muted" x="{x_at(share):.1f}" y="{bottom_y + 18}" font-size="11" text-anchor="middle">{share:.0%}</text>')
    width = (right - left) / (len(edges) - 1)
    for i, count in enumerate(counts):
        if count == 0:
            continue
        x, y = x_at(edges[i]) + 1, y_at(count)
        h = bottom_y - y
        body.append(f'<path class="s1" d="M{x:.1f},{bottom_y} v{-(h - 4):.1f} a4,4 0 0 1 4,-4 h{width - 10:.1f} '
                    f'a4,4 0 0 1 4,4 v{h - 4:.1f} z"/>')
    marks = sorted((float(shares[f]), name) for f, name in demo.items() if f in shares.index and pd.notna(shares[f]))
    for k, (share, name) in enumerate(marks):
        x = x_at(share)
        near_next = k + 1 < len(marks) and x_at(marks[k + 1][0]) - x < 90
        near_prev = k > 0 and x - x_at(marks[k - 1][0]) < 90
        anchor, dx = ("end", -5) if near_next else ("start", 5) if near_prev else ("middle", 0)
        body.append(f'<line class="axis" x1="{x:.1f}" y1="{top_y - 20}" x2="{x:.1f}" y2="{bottom_y}"/>')
        body.append(f'<text class="ink" x="{x + dx:.1f}" y="{top_y - 24}" font-size="12" text-anchor="{anchor}">'
                    f'{escape(name)} {share:.0%}</text>')
    median = float(shares.median())
    return _svg(
        f"A few storms are most of the dark hours: median county {median:.0%}",
        f"Share of each county's outage customer-hours since 2018 from its {settings.TAIL_EVENTS} largest events; "
        f"{int(shares.notna().sum())} Texas counties",
        body,
        "Source: EAGLE-I (ORNL) county outages; Porchlight pipeline/insights.py. Counts only hours inside detected events.",
    )


def reliability_svg(summary: pd.DataFrame, years: tuple[int, int]) -> str:
    """Paired bars per utility: outage hours per customer with and without major event days."""
    left, right, y0, bar_h, pair_gap, group_gap = 170, WIDTH - 150, 104, 12, 2, 12
    top = nice_max(float(summary["saidi_with_med"].max()) / 60.0)
    x_at = lambda h: left + (right - left) * h / top  # noqa: E731
    group_h = 2 * bar_h + pair_gap + group_gap
    bottom = y0 + len(summary) * group_h - group_gap
    body = [
        f'<circle class="s1" cx="{left}" cy="{y0 - 22}" r="5"/>',
        f'<text class="ink2" x="{left + 10}" y="{y0 - 18}" font-size="12">All outage time customers lived through</text>',
        f'<circle class="s2" cx="{left + 290}" cy="{y0 - 22}" r="5"/>',
        f'<text class="ink2" x="{left + 300}" y="{y0 - 18}" font-size="12">Headline figure, major event days removed</text>',
    ]
    for tick in np.linspace(0, top, 4):
        body.append(f'<line class="grid" x1="{x_at(tick):.1f}" y1="{y0 - 6}" x2="{x_at(tick):.1f}" y2="{bottom + 4}"/>')
        body.append(f'<text class="muted" x="{x_at(tick):.1f}" y="{bottom + 20}" font-size="11" text-anchor="middle">{tick:.0f} h</text>')
    for i, (utility, row) in enumerate(summary.iterrows()):
        y = y0 + i * group_h
        body.append(f'<text class="ink" x="{left - 12}" y="{y + bar_h + 5}" font-size="13" text-anchor="end">{escape(str(utility))}</text>')
        for k, (column, cls) in enumerate((("saidi_with_med", "s1"), ("saidi_without_med", "s2"))):
            hours = float(row[column]) / 60.0
            width = max(x_at(hours) - left, 5.0)
            by = y + k * (bar_h + pair_gap)
            body.append(f'<path class="{cls}" d="M{left},{by} h{width - 4:.1f} a4,4 0 0 1 4,4 v{bar_h - 8} '
                        f'a4,4 0 0 1 -4,4 h{-(width - 4):.1f} z"/>')
            body.append(f'<text class="ink2" x="{left + width + 6:.1f}" y="{by + bar_h - 2}" font-size="11">{hours:.0f} h</text>')
        body.append(f'<text class="ink" x="{WIDTH - 24}" y="{y + bar_h + 5}" font-size="13" text-anchor="end">'
                    f'{row["share_removed"]:.0%} removed</text>')
    low, high = summary["share_removed"].min(), summary["share_removed"].max()
    return _svg(
        f"Official reliability leaves out {low:.0%}-{high:.0%} of the dark",
        f"Outage hours per customer, {years[0]}-{years[1]} combined (SAIDI), with and without major event days",
        body,
        "Source: EIA-861 reliability files; Oncor and TNMP report under a non-IEEE standard. Porchlight pipeline/sources/eia861_reliability.py.",
    )


def persona_hours(con: duckdb.DuckDBPyConnection) -> dict[str, list[float]]:
    table = con.execute(
        "select county_fips, month, hours from backup_monthly where cores = 1 and mode = 'normal' order by county_fips, month"
    ).df()
    return {label: table.loc[table["county_fips"] == fips, "hours"].round(1).tolist() for fips, label in PERSONAS}


def main() -> int:
    out = settings.INSIGHTS_CHART_DIR
    out.mkdir(parents=True, exist_ok=True)
    record = json.loads(settings.BACKTEST_JSON.read_text())
    (out / "backtest.svg").write_text(backtest_svg(record))
    with duckdb.connect(str(settings.FEATURES_DUCKDB), read_only=True) as con:
        (out / "backup_by_month.svg").write_text(month_svg(persona_hours(con)))
    tails = pd.read_parquet(settings.TAIL_SHARE_PARQUET)["top_share"]
    (out / "tail_share.svg").write_text(tail_svg(tails, settings.DEMO_COUNTIES))
    if settings.EIA861_CSV.exists():
        from pipeline.sources.eia861_reliability import med_share

        reliability = pd.read_csv(settings.EIA861_CSV)
        years = (int(reliability["year"].min()), int(reliability["year"].max()))
        (out / "reliability_med.svg").write_text(reliability_svg(med_share(reliability), years))
    print(f"wrote the insight charts to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
