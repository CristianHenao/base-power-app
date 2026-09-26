# Nolan's slice: models, simulator, narrator

Work top to bottom. Each task is one branch and one PR. Gates are from the team timeline.

## Contract fields I own (report JSON, sheet A-02)
- `outlook`: level, label, long_outages_per_year, interval_90, once_every_years, years_of_data
- `events[]`: id, label, start, peak_out_pct, duration_h.p50/p90 as [fifo, lifo], covered.cores_1/cores_2 {homes, hours}
- `backup`: hours_by_month.cores_1/cores_2 (12 values each), assumptions
- `sizing`: cores, reason
- `narrative`: streamed summary with validator status

## Tasks

### 1. EAGLE-I ingest for 3 demo counties (Fri, before 1:30 AM gate)
Counties: Collin 48085 (Sally), Harris 48201 (Thomas), Travis 48453 (third address).
- `pipeline/sources/eaglei.py`: read yearly CSVs, keep Texas, keep 2018 onward for rates, write parquet.
- Run `extract_events` per county; write `data/processed/events.parquet` with county_fips.
- Done when: a notebook cell prints each county's 10 largest events with dates and duration bands,
  and Feb 2021 and Jul 2024 show up where expected.

### 2. Simulator on real load (Fri night)
- `pipeline/sources/ercot_profiles.py`: parse backcasted load profile yearly files; pick RESHIWR
  (electric heat) or RESLOWR, weather zone from the county crosswalk (Alejandro).
- For each event: 7-day trace from event start, `scale_to_home`, `hours_until_empty` for 1 and 2 Cores,
  then `coverage` against the FIFO and LIFO duration bands.
- Monthly typical-day backup hours for `backup.hours_by_month`.
- Done when: Sally's Feb 2021 and Thomas's Jul 2024 numbers look physically sane (hand check with Alejandro).

### 3. Statewide outlook and backtest (Sat morning, before 1 PM gate)
- Full Texas events; `county_outlook` per weather zone.
- Backtest: fit 2018-2022, score 2023-2024 with Poisson deviance and Spearman vs statewide mean and raw rate.
- Export `web/public/insights/backtest.png` (or JSON for Christian to chart). Ship it whatever it says.

### 4. Sizing and feature table (Sat morning)
- `recommend_cores` using covered-hours share across the county's 12h+ events.
- Write everything the API needs into `data/features.duckdb` tables: outlook, events, backup_monthly.
- Done when: `/v1/report` for all three personas returns real numbers with no fixture fields left.

### 5. Narrator with guardrails (Sat afternoon)
- Input: report JSON with fact ids. Output: headline, <=120-word summary, fact ids used.
- Validators: numbers must match facts after rounding; banned phrases (fear words, "guarantee",
  "never lose power"); Flesch-Kincaid grade <= 7 (textstat); length cap.
- One retry with the failure reason, then deterministic template. Stream via SSE (Victor wires the route).
- `evals/`: 24 fixtures (8 counties x 3 homes); record outputs; CI scores recorded outputs.
- Done when: pass-rate table is in the README.

### 6. Grid value by load zone (Sat afternoon, P1)
- `gridstatus.Ercot().get_rtm_spp(year)` for 2019-2025.
- Daily LP per load zone for one 20 kW / 39.2 kWh unit, ~90% round trip; count intervals > $1,000/MWh.
- Label as a perfect-foresight upper bound. Output per load zone per year for the pays-twice map.

### 7. Insights with Alejandro (Sat afternoon)
- Same Core, different month (backup hours by month and weather zone).
- Tail share: top-5 events' share of customer-outage-hours per county.
- Help with the EIA-861 with/without major event days chart and the energy-only exposure list.

### 8. MODEL_CARD.md (Sat evening)
Data, coverage caveats (zeros can be scraping gaps), FIFO/LIFO assumption, prior choice,
backtest result, simulator assumptions (start SoC, storm factor, reserve), known limits.

## Prompts to paste into Claude Code

Start every session in plan mode and have it read CLAUDE.md and this file first.

1. "Read CLAUDE.md and docs/nolan-spec.md, then map this repo: where do pipeline code, the API,
   schemas and tests live? Propose where my modules go if the layout differs. Don't write code yet."
2. "Do task 1. Write pipeline/sources/eaglei.py with tests on a tiny synthetic CSV, then a script
   that builds events.parquet for 48085, 48201, 48453 from data/raw/eaglei. Stop and show me the top events."
3. "Do task 2. Start by showing me the first 20 rows and columns of one ERCOT backcasted profile file
   so we agree on the parser before writing it."
4. "Do task 3. Put the backtest in pipeline/backtest.py with a CLI, and print the metrics table."
5. "Do task 5. Keep the LLM behind an adapter with a timeout and template fallback. Write the validators
   and their tests before the prompt."
