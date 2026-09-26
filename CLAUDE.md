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
A map of Texas utilities and counties for Base sales: where hazards and grid stress overlap, where
storms actually hit, how big each grid is, and what a Base fleet would add. Four modes (Risk,
Hazards, Grid, Base fleet), five lenses, 12 layers from public data. Spec: docs/utility-map-prd-v3.md;
tickets and status: docs/utility-map-roadmap.md (v1/v2 PRDs kept for history).
- Data build: `pipeline/utility_map/` (Alejandro). `make map-download` then `make export-map` rebuilds
  every table and publishes `public/utility-map/releases/<id>/` + `current.json` only if all gates
  pass (gate-report.json in each release; current + previous release kept). Raw files come from
  `settings.RAW_DIR`; in a worktree, `export PORCHLIGHT_RAW_DIR=~/Desktop/base-power-app/data/raw`.
- The app reads `public/utility-map/current.json`; the old dummy mockup loads only with `?data=mock`.
- Route `src/app/utility-map/`; live NWS warnings `src/app/api/utility-map/live/`; components
  `src/components/utility-map/`; pure logic with Node tests in `src/lib/utility-map/` (`npm run test:web`).
- Counties are served by several utilities: every utility-level number uses its estimated share of
  each county (EIA-861 membership, modeled split). Unverified Base offers read "Offer not verified".
- Hazard colors come from the validated palette in PRD v3 §12.5 and always travel with an icon.
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
