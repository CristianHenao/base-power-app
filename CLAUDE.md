# Porchlight (Base Power x AITX Talent Hackathon)

Porchlight answers "will my lights stay on?" for a Texas address: county outage history,
a replay of real storms against a Base Core battery, backup hours by month, and a
1-vs-2 Core recommendation. A second screen ranks counties where a Core "pays twice."
Judged by Base engineers from a 5-minute video and this codebase. Deadline Sun Sep 27, 11:00 AM CT.

Full plan: https://claude.ai/artifact/5uJY9qNnrtjKM9MfZRT9q3 (sheets A-02 contract, D-01 data, M-01 models).

## Owners
- Christian: web app (report page, map). Victor: API service, adapters, compose, CI, deploy.
- Nolan: pipeline models, simulator, narrator. Alejandro: data downloads, crosswalks, story.
- Stay inside your own folders unless the change is agreed in chat. Contract changes go through schemas first.

## Nolan's scope (see docs/nolan-spec.md for tasks and acceptance criteria)
- pipeline/events.py      outage events and FIFO/LIFO per-home duration bands (EAGLE-I)
- pipeline/outlook.py     12h+ outage rate per typical home, empirical Bayes per weather zone, backtest
- pipeline/grid_value.py  load-zone scarcity hours and battery arbitrage upper bound (ERCOT RTM SPP)
- api/app/sim/backup.py   Core simulator on ERCOT backcasted load profiles; sizing
- api/app/narrator/       LLM summary with validators and template fallback; evals/ harness

## Rules
- Numbers come from the pipeline. The LLM never calculates; every number it writes must match a fact.
- Base facts allowed on screen: 39.2 kWh and 20 kW per Core, about 36-72 h backup for 1-2 Cores.
  Never hardcode prices. Label every estimate as an estimate.
- Outage data is county-level: say "homes in your county," never "your home."
- No raw addresses stored; no medical or household details leave the browser.
- Python 3.11, type hints, pure functions where possible, pytest for everything in pipeline/ and sim/.
- Run `python -m pytest -q` before every commit. Small commits, clear messages, one branch per task.
- Large raw data lives in data/raw (gitignored). Derived features go to data/features.duckdb.
- Times are America/Chicago in the UI, UTC in storage. Watch DST duplicates in ERCOT data.
