# Porchlight (Base Power x AITX Talent Hackathon)

Porchlight answers "will my lights stay on?" for a Texas address: county outage history,
a replay of real storms against a Base Core battery, backup hours by month, and a
1-vs-2 Core recommendation. A second screen ranks counties where a Core "pays twice."
A third experience, the utility map (`/utility-map`), gives every Texas county and utility a Grid Risk Index.
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

## Utility map
A map of every Texas county and utility and how at risk its grid is. Built for Base's sales team and
also shown to utilities, so it speaks in risk, not sales. Four questions in the left panel: **Grid Risk
Index** (default), **Explore hazards** (historical patterns or one past storm, never both), **Understand
the grid** (demand shading, power plants) and **Model Base impact** (1/5/10% fleet). 12 layers from
public data. Specs: docs/utility-map-prd-v3.md (data, layers), docs/superpowers/specs/
2026-09-26-utility-map-coherent-views-design.md (views, index, score card); tickets: docs/utility-map-roadmap.md.

**Grid Risk Index** (`pipeline/utility_map/risk_index.py`, published as `risk` on every county and utility)
- 1-100, higher = more at risk, relative to Texas peers (not absolute). Half hazard exposure (flood,
  tornado, hail and wind, hurricane, winter freeze, extreme heat), half grid stress (long outages, price
  spikes in ERCOT, summer peak demand). Each half is the mean of its layers' 0-1 Texas ranks.
- Counties are ranked against the 254 counties; utilities use their counties weighted by the utility's own
  estimated customers there, ranked against the 150 utilities. Bands are fifths: Low, Moderate, Elevated,
  High, Severe. Missing layers are left out (never 0); `sources` says how many of the 9 were used.
- Potential homes, local generation and the FEMA composite are context, not in the index.
- Known caveat: summer peak demand is MW (a size measure), so large systems score high on grid stress
  partly for size. Peak per customer is the likely fix if utilities push back.

**Frontend: one view, one answer**
- `src/lib/utility-map/view.ts` holds the one view state (question, hazards, storm, grid switches, fleet
  share, utility, county) with its transitions and URL round trip; reloads and shared links reopen it.
  Old `?mode=` and `?q=opportunities` links still work.
- `describe-view.ts` turns the view into caption, legend, county fill, tooltip text and table rows. The map,
  map key, tooltip, details and tables must all read from it; don't compute a second answer in a component.
- Every utility and county panel opens with the score card (`score-card.tsx`, wording in
  `lib/utility-map/score-card.ts`): the score, rank and band, what the band means, an "In short" summary
  built only from pipeline numbers (templates, no LLM), then chapters: 1 how at risk, 2 why, 3 what has
  happened, 4 how big is this grid, 5 right now, 6 what Base could add. Picking a question in the left
  panel scrolls the open card to its chapter (`chapterFor`: risk 1, hazards 2, grid 4, fleet 6).
  View-specific detail follows under "More for this view".
- Statewide, the Grid Risk Index is a ranked table; "Open the full table" (`risk-table-sheet.tsx`, rows in
  `lib/utility-map/risk-table.ts`) lists all utilities and counties with every factor, sortable and searchable.
- Route `src/app/utility-map/`; live NWS warnings `src/app/api/utility-map/live/`; components
  `src/components/utility-map/`; pure logic with Node tests in `src/lib/utility-map/` (`npm run test:web`).
  Put logic in `lib/` with a test first; components stay thin.

**Data build** (`pipeline/utility_map/`, Alejandro)
- `make map-download` then `make export-map` rebuilds every table and publishes
  `public/utility-map/releases/<id>/` + `current.json` only if all gates pass (gate-report.json in each
  release; current + previous release kept). To republish after a code change, `python -m
  pipeline.utility_map.assemble` is enough. Raw files come from `settings.RAW_DIR`; in a worktree,
  `export PORCHLIGHT_RAW_DIR=~/Desktop/base-power-app/data/raw`.
- The release ID hashes `utility-map.json` only: a change to another release file (e.g. storms.json) keeps
  the ID, so browsers may need a hard refresh.
- The app reads `public/utility-map/current.json`; the old dummy mockup loads only with `?data=mock`.
- Counties are served by several utilities: every utility-level number uses its estimated share of each
  county (EIA-861 membership, modeled split).
- Storm shares: where a county's customer count was raised to its peak outage (outlook
  `customers_floored`), the share out is null and shown as "share unknown", never 100%.

**Design and wording**
- The Base style guide (docs/base-power-styleguide.md) applies to this route only, via the `.bp-theme`
  wrapper and `src/app/utility-map/base-theme.css`. Don't restyle shared components for it.
- Popovers and sheets render in a portal; give them the `.bp-theme` root (see `evidence-popover.tsx`).
- Hazard colors come from the validated palette in PRD v3 §12.5 and always travel with an icon.
- Say what a number means: ranks as "#12 of 254 counties" or "higher than 80% of Texas counties",
  "historical relative risk, not a forecast", "homes in this county", and label estimates.
- No sales framing on screen (no "opportunities", no Base-offer groupings); Base's fleet lives in Model
  Base impact and chapter 5 of the score card.

**Running it**
- The route is behind Supabase sign-in. To preview locally without signing in, comment out the
  `NEXT_PUBLIC_SUPABASE_*` lines in your own `.env.local`. Dev server on port 3001.
- Chrome automation can't render the map (the tab reports hidden); use the headless agent-browser.
- Narrow screens (< 1024 px) work but the map is built for desktop; a full mobile layout and Present mode
  are designed but postponed: docs/superpowers/specs/2026-09-26-utility-map-present-mode-design.md.

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
