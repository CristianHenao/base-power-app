# Porchlight model card

This card covers the numbers on the report page and the map: the county outage outlook, the
per-home outage duration bands, the Base Core backup simulator, the Core sizing rule, grid value by
load zone, and the narrator. Every number on screen comes from the pipeline. The narrator words it
and never computes it.

Rebuild everything with:

```
python -m pipeline.backtest     # events_texas.parquet, outlook.parquet, backtest.json
python -m pipeline.features     # data/features.duckdb (about 45 s with the profile cache)
python -m pipeline.grid_value   # grid_value.parquet (after pipeline.sources.ercot_prices)
python -m evals.score           # evals/results.md
```

## Intended use

- Answer "how often do long outages hit homes in my county, and how long would a Core last?" for a
  Texas address, at county level.
- Rank counties where a Core has both backup value and grid value.
- Not for: predicting an outage at one address, insurance or medical decisions, or quoting
  earnings. Base confirms sizing at install.

## Data

| Source | What we use | Years | Owner |
|---|---|---|---|
| EAGLE-I (ORNL), county customers-out every 15 min | Outage events, durations, rates | 2018-2025 | Nolan |
| EAGLE-I MCC.csv (Figshare) | Modeled customers per county, 2022 | 2022 | Nolan |
| ERCOT backcasted load profiles | 15-min household load, by profile and weather zone | 2018-2025 | Nolan |
| ERCOT real-time settlement point prices (via gridstatus) | Grid value by load zone | 2019-2025 | Nolan |
| ZIP and county to ERCOT weather zone crosswalk | Prior groups for the outlook | current | Alejandro |
| Base public site | 39.2 kWh and 20 kW per Core | current | - |

All timestamps are stored in UTC and shown in America/Chicago. Event ids are
`{fips}-{Central start date}`, with `-2` added when two events in a county start on the same
Central day (the Travis 2021 freeze is `48453-2021-02-14-2`).

### Coverage caveats

- EAGLE-I stores quiet periods as missing rows, and we read missing as zero customers out. A
  missing row can also be a scraping gap, and gaps are more likely during large storms. Some real
  outage hours are therefore lost, which biases durations and rates low.
- EAGLE-I counts are scraped from utility outage maps. Utilities differ in how they report, and a
  county served by several utilities can be partly covered.
- Customers per county are the 2022 modeled counts (MCC.csv) for every year. Some are far too low
  (Jeff Davis County has 44), and EAGLE-I sometimes books a utility's outage to one county, so 112
  counties once showed more than 100% of customers out. A county's customer count is now at least
  the most customers ever out there at once. 113 counties use that floor, and the outlook table
  flags them in `customers_floored`.
- The 2023 EAGLE-I file names the count column `sum` instead of `customers_out`. The reader
  accepts both.
- Years before 2018 are left out because coverage is thin. A county's years of data start at its
  first reading, so a county that started reporting late is not credited with quiet years.

## Outage events and per-home durations (`pipeline/events.py`)

An event starts when customers out reach at least 50 or 0.1% of the county's customers, whichever
is larger. Gaps under 1 hour are merged, and events under 30 minutes are dropped.

EAGLE-I reports how many customers are out, not which ones. To turn the county curve into per-home
durations we replay it as a queue, where a rise means homes going dark and a fall means homes
restored, under two orderings:

- FIFO: the first homes out are the first restored. This gives the shortest plausible tail.
- LIFO: the last homes out are the first restored. This gives the longest plausible tail.

Both orderings give the same customer-hours, so the truth sits between them. We report both as a
band and use LIFO wherever one number is needed (the 12-hour-plus rate and sizing), because it is
the conservative choice for a backup product. The pair is [FIFO, LIFO], not [low, high]; for a few
events (Beryl in Harris) the FIFO p90 is the longer one.

A noisy curve can replay the same homes going dark more than once, so an event's 12-hour-plus
share is capped at its peak share of customers. Before the cap, Beryl counted as 1.3 long outages
per Harris home.

## Outlook: long outages per typical home (`pipeline/outlook.py`)

The metric is the expected number of 12-hour-plus outages per year for a typical home in the
county, under LIFO durations. Each event contributes the share of the county's customers who were
out 12 hours or more, so counts can be fractional.

Rates are shrunk with a gamma-Poisson empirical Bayes model. The prior is fit separately within
each ERCOT weather zone (county to zone from Alejandro's crosswalk), and the posterior gives a
90% interval. Counts are sums of fractional shares, which are less noisy than counts of whole
events, so the model is quasi-Poisson. Within each zone, counts and years are divided by
phi = sum(s^2) / sum(s) over the per-event shares s. Phi is 0.30-0.54 by zone. Without it, the
prior treated nearly all spread between counties as noise and every county collapsed onto its zone
mean. The between-county variance is still floored at a coefficient of variation of 0.25.

Levels come from fixed bands on "a 12-hour-plus outage about once every N years": 3 or fewer is
Very high, 3-6 High, 6-10 Elevated, 10-15 Moderate, over 15 Low. Statewide quintiles were
dropped because rates cluster within zones, and the middle cut points were only 0.005 a year
apart. Statewide, 61 counties are High, 68 Elevated, 117 Moderate and 8 Low. None is Very high.

Demo counties, 2018-2025:

| County | Zone | 12h+ outages per year | 90% interval | About once every | Level |
|---|---|---|---|---|---|
| Collin (48085) | NCENT | 0.094 | 0.040-0.166 | 11 years | Moderate |
| Harris (48201) | COAST | 0.230 | 0.151-0.322 | 4 years | High |
| Travis (48453) | SCENT | 0.091 | 0.059-0.128 | 11 years | Moderate |

Earlier builds showed Collin Low, Harris High (0.32) and Travis Elevated. The customer floor, the
per-event cap and the quasi-Poisson prior account for the change.

### Backtest (`data/processed/backtest.json`)

Fit on 2018-2022 and scored on 2023-2024, over the 254 counties with data in both windows.

| Method | Poisson deviance (lower is better) | Spearman rank correlation |
|---|---|---|
| Empirical Bayes, weather-zone prior | **133** | **0.34** |
| Weather-zone mean | 136 | 0.31 |
| Statewide mean | 163 | n/a (one value) |
| Raw county rate | infinite | 0.28 |

The raw rate has infinite deviance because 5 counties had no long outages in training and at least
one in testing. Most of the skill comes from the weather zone. The county-level shrinkage adds a
little on top (133 against 136, and 0.34 against 0.31). A 0.34 rank correlation is modest: two
test years is a short window, and one storm can move a county a lot. The UI shows the interval and
says "estimate." Earlier builds reported 551 against 708. Those were on the inflated counts and are
not comparable.

## Backup simulator (`api/app/sim/backup.py`, `pipeline/simulate.py`)

The simulator walks a household load trace down one or two Cores in 15-minute steps until the
stored energy runs out.

- Load comes from ERCOT backcasted residential profiles, scaled to the home's annual kWh. Collin
  assumes electric heat (RESHIWR); Harris and Travis assume no electric heat (RESLOWR).
- Monthly backup hours use the median day of each month from the 2024 profile, repeated for up to
  14 days. Days with 23 or 25 hours from daylight saving time are left out of the median.
- Storm replays use the event's own week of that year's profile, starting at Central midnight on
  the event date.

| Assumption | Value | Status |
|---|---|---|
| Energy per Core | 39.2 kWh | Base public spec |
| Power per Core | 20 kW | Base public spec. The help center lists 11 kW for backup. At 11 kW, large electric-heat loads would trip the overload flag sooner. |
| Starting charge | 100% | Assumed, since storms are forecast. Not confirmed by Base. |
| Reserve floor | none | Unknown. A reserve would shorten every number. |
| Inverter and battery efficiency | 100% | Unknown. Real losses would shorten every number. |
| Storm mode | load × 0.7 | A labeled assumption (a 30% cut from shedding big loads). Base has not published a factor. |
| Load above inverter power | clipped and flagged | The shortfall is not counted as served. |

Resulting monthly range with the normal load (2024 profile): about 16-35 h for one Core and 32-68 h
for two in Collin; 15-44 h and 25-87 h across Harris and Travis. August is the shortest month in
Harris and Travis, and January in Collin (electric heat). This fits Base's "about 36-72 h for 1-2
Cores" only in mild months, and the page says so by month.

Duration coverage against historical events is reported both ways. "Homes covered" is the share of
affected homes whose whole outage fits inside the backup hours. "Hours covered" is the share of
their dark hours the Core supplies.

The 2025 ERCOT profile workbook has both a 29-day "September" sheet and a 30-day "Sep" sheet.
Sheets are matched by the dates they contain, and the fuller sheet wins.

## Sizing (`pipeline/sizing.py`)

Recommend the smallest Core count that would have covered at least 90% of the county's
12-hour-plus outage hours since 2018, using LIFO durations and each event's own replayed backup
hours. If no option reaches 90%, recommend the largest option we model (two Cores) and say it falls
short.

| County | 1 Core (LIFO) | 2 Cores (LIFO) | 1 Core (FIFO) | 2 Cores (FIFO) | Recommendation |
|---|---|---|---|---|---|
| Collin | 37% | 52% | 69% | 99% | 2 Cores |
| Harris | 48% | 63% | 50% | 67% | 2 Cores |
| Travis | 59% | 89% | 91% | 99% | 2 Cores |

Shares are truncated, not rounded, to match the report sentence. No county reaches 90% under LIFO
with two Cores, so all three get two Cores with the "most of the options we model" wording.

The LIFO/FIFO gap is the ordering uncertainty described above. Under FIFO one Core would already
reach 90% in Travis. The reason sentence always ends "Base confirms sizing at install."

The eval fixtures (`evals/build_fixtures.py`) use an approximation. They size with each month's
typical-day backup hours for the event's month rather than replaying the event's own week. That is
good enough to test the narrator but is not the number served in the report.

## Grid value (`pipeline/grid_value.py`)

For each load zone and Central-time day, a linear program (scipy HiGHS) charges and discharges one
20 kW / 39.2 kWh unit against that day's real-time prices, with 90% round-trip efficiency and an
empty start each day. The count of 15-minute intervals above $1,000/MWh is reported beside it.

This is an **upper bound, not a forecast**. It assumes perfect foresight of every price, no
backup reserve held back, no degradation cost, no fees, and wholesale prices passed straight
through. A homeowner does not receive this. Results run from about $900 to $4,900 a year per
load zone (2018-2025). Winter Storm Uri shows as about 650 intervals above $1,000/MWh in each zone
in 2021, and 2023 is the highest-value year in every zone. The pays-twice map still needs a county
to load-zone mapping.

Prices are the plain load-zone settlement prices (LZ). ERCOT's annual file also lists an
energy-weighted series (LZEW) under the same names, and gridstatus labels both as "Load Zone".
Earlier builds mixed the two, which doubled the scarcity counts and overstated the arbitrage bound.
The fetcher now fails if any interval and location appear twice.

## Narrator (`api/app/narrator/`, `evals/`)

The model is Grok (`grok-4.20-0309-non-reasoning`, xAI) at temperature 0 in JSON mode, behind a
small adapter (`api/app/narrator/xai.py`) that reads `XAI_API_KEY` from the environment. It gets the
report as a list of facts, each with an id and its allowed rounded values. It writes a headline of
up to 12 words and a summary of up to 120 words, and cites the fact ids it used. Validators reject
the output if:

- a number does not match a cited fact after rounding,
- a number is stated out of context: it lacks the fact's unit (hours, %, years), the sentence lacks
  the fact's context (the month for backup hours, "long" or "12-hour" for the outage rate and sizing
  share), or its clause names a different Core count than the fact,
- it uses a banned phrase (fear words, "guarantee", "never lose power", "risk-free"),
- its Flesch-Kincaid grade is above 7 (computed with pyphen syllable counts),
- it is over the length caps.

The context checks were added after reading recorded outputs. Before them, 23 of 24 replies passed,
but some wrote one-Core hours as two Cores, or wrote the 12-hour-plus rate as a rate for any outage.

A rejected output gets one retry with the reasons, and then falls back to a deterministic template.
The eval set is 24 fixtures (8 counties × 3 homes):

| Source | Passed |
|---|---|
| Grok, first reply | 24/24 (100%) in the latest run |
| Grok, after one retry | 24/24 (100%) |
| Template | 24/24 (100%) |

Across runs at temperature 0 the first-reply pass rate has ranged from 92% to 100%. After the
retry it has been 96-100%. Median model time is 2.2-2.7 seconds per report, against an 8-second
timeout. The validators check that
numbers are right, not tone. For example, "homes with electric heat need 2 Cores" passes, but it is
stronger than the facts support.

## Known limits

- County-level data only. The page says "homes in your county," never "your home."
- Two test years and one ordering assumption bound how much the outlook can say. Treat the level
  as a ranking, not a probability for one address.
- The simulator has no weather response beyond the profile year it replays, no home-specific
  appliances, and no solar.
- Specs we could not confirm (reserve, efficiency, backup power rating, storm mode) all push real
  backup hours down from what we show, except storm mode, which is a labeled reduction in load.
- Persona numbers are awaiting a hand check with Alejandro (ticket A8).
