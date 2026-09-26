# Porchlight (Base Power x AITX Talent Hackathon)

Porchlight answers "will my lights stay on?" for a Texas address: county outage history,
a replay of real storms against a Base Core battery, backup hours by month, and a
1-vs-2 Core recommendation. A second screen ranks counties where a Core "pays twice."
A third experience, the utility map (`/utility-map`), is a risk-profile tool for Base's sales team.
Judged by Base engineers from a 5-minute video and this codebase. Deadline Sun Sep 27, 11:00 AM CT.

Full plan: https://claude.ai/artifact/5uJY9qNnrtjKM9MfZRT9q3 (sheets A-02 contract, D-01 data, M-01 models).

## Owners
- Christian: web app (report page, map). Victor: API service, adapters, compose, CI, deploy.
- Nolan: pipeline models, simulator, narrator. Alejandro: data downloads, crosswalks, story,
  and the utility map (implementation plus final dataset/export assembly).
- Stay inside your own folders unless the change is agreed in chat. Contract changes go through schemas first.

## Nolan's scope (see docs/nolan-spec.md for tasks and acceptance criteria)
- pipeline/events.py      outage events and FIFO/LIFO per-home duration bands (EAGLE-I)
- pipeline/outlook.py     12h+ outage rate per typical home, empirical Bayes per weather zone, backtest
- pipeline/grid_value.py  load-zone scarcity hours and battery arbitrage upper bound (ERCOT RTM SPP)
- api/app/sim/backup.py   Core simulator on ERCOT backcasted load profiles; sizing
- api/app/narrator/       LLM summary with validators and template fallback; evals/ harness

## Utility map (Base sales)
A map of Texas utilities and counties colored by grid stress. Reps toggle evidence layers (outages,
weather hazard, flood, grid scarcity, homes exposed), drill from utility to county, and see what a
Base fleet would add. Specs: docs/utility-map-prd.md (v1) and docs/utility-map-prd-v2.md (v2).
- Route `src/app/utility-map/`; components `src/components/utility-map/`; pure scoring and fleet math
  `src/lib/utility-map/` (percentile ranks, equal weights, customer-weighted utility score, quintile levels).
- Data contract: three precomputed files (`utility-map.json`, `counties.geojson`, `territories.geojson`).
  The app reads `public/utility-map/mock/` today (dummy data, built by `scripts/utility-map/build_mock_data.py`).
  Real data replaces that folder; switch `DATA_BASE` in `utility-map-experience.tsx`.
- Styling: the Base style guide (docs/base-power-styleguide.md) is applied to this route only, via the
  `.bp-theme` wrapper and `src/app/utility-map/base-theme.css`. Don't restyle shared components for it.
- The route is behind Supabase sign-in. To preview locally without signing in, comment out the
  `NEXT_PUBLIC_SUPABASE_*` lines in your own `.env.local`.
- Present mode and mobile layout are designed but postponed:
  docs/superpowers/specs/2026-09-26-utility-map-present-mode-design.md.

## Reference docs
- docs/battery-tech-specs.md: Base Core specs, backup duration, how members save, grid revenue, ADER.
- docs/base-power-styleguide.md: colors, type, spacing, components.
- docs/alejandro-tickets.md, docs/nolan-spec.md: task lists. `/playbook` serves the team playbook in the app.

## Rules
- Numbers come from the pipeline. The LLM never calculates; every number it writes must match a fact.
- Base facts allowed on screen: 39.2 kWh and 20 kW per Core; about 12-18 h backup for a typical home
  on one Core, up to 36 h with reduced use ("36-72 h for 1-2 Cores" is Base's reduced-use headline).
  Base keeps about a 20% backup reserve. Sources in docs/battery-tech-specs.md.
  Never hardcode prices. Label every estimate as an estimate.
- Outage data is county-level: say "homes in your county," never "your home."
- No raw addresses stored; no medical or household details leave the browser.
- Python 3.11, type hints, pure functions where possible, pytest for everything in pipeline/ and sim/.
- Run `python -m pytest -q` before every commit. Small commits, clear messages, one branch per task.
- Ship through pull requests into main; don't push to main directly. Vercel only deploys commits from
  authors on the Vercel team, so ask Christian to add you if your merges don't go live.
- Large raw data lives in data/raw (gitignored). Derived features go to data/features.duckdb.
- Times are America/Chicago in the UI, UTC in storage. Watch DST duplicates in ERCOT data.
