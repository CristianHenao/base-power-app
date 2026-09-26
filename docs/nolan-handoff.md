# Nolan's handoff (Sat Sep 26, 2026, 4:30 PM CT)

For the next Claude session working on Nolan's slice of Porchlight. Read CLAUDE.md, docs/nolan-spec.md,
this file, and the N-01 "Now / Next" sheet at the top of `Porchlight team playbook.html` first.
Submission is Sun Sep 27, 11:00 AM CT; 7:00 PM Sat is a timed demo run-through; 11:00 PM Sat is feature freeze.

## Working rules (from Nolan)
- Nolan's files: pipeline/, api/, evals/, tests/, data/processed/, data/features.duckdb, pyproject.toml, MODEL_CARD.md.
  Nolan also covered Victor's platform tasks and some of Alejandro's; the playbook says which.
- After finishing a task: commit, `git fetch origin main`, rebase, run `python -m pytest -q` with `set -o pipefail`
  (a pipe to `tail` hides failures), push to origin main, then record the short hash in the playbook
  (N-01 row plus a "<strong>Shipped</strong> <code>hash</code>" note in the matching sheet) and push that.
  Nolan chose direct pushes to main even though CLAUDE.md now says PRs.
- Typed, small, pure functions; paths and constants only in pipeline/settings.py; UTC in storage, America/Chicago on screen.
  The LLM never calculates. Commit subject is one plain sentence, body says why.
- Never commit data/raw, .env, .env.local, .venv, or "Hackathon details.md".

## State of the work
- Models: outlook (empirical Bayes per weather zone, quasi-Poisson, customer floor, fixed-band labels), per-home
  duration band [rotate, stay], backup simulator (normal, storm, 20% reserve "surprise"), sizing, grid value
  (LZ prices only, not LZEW), narrator with Grok and validators. Numbers and caveats: MODEL_CARD.md.
- Statewide: every county gets a report, storm replays and a Core recommendation (pipeline/statewide.py).
- API: FastAPI in api/app (report, narrative SSE, grid snapshot, pays-twice areas, funnel events, fault switch,
  metrics). Web: /report page, typed client in src/lib/report, appliance calculator in src/lib/report/core-runtime.ts.
- Tests: 252 passing on committed data only (no raw data needed). CI runs pytest and the eval scorer.

## Open work, in Nolan's order
1. Outlook model with county covariates (GLM or LightGBM, Poisson objective) as a new method in
   `backtest_outlook` (pipeline/outlook.py). Beat deviance 122 and rank correlation 0.42 on the 2023-24 backtest.
   Watch leakage: FEMA NRI is a 2025 snapshot.
2. LLM-as-judge for narrator tone (evals/judge.py), plus a model comparison table (pass rate, judge score, latency, cost).
3. Stretch: survival model for restoration times (lifelines), data-quality anomaly flags, appliance-scan guardrails.
4. Evening: run-through checklist (persona addresses, fault-switch steps), README and model card pass, tag v0.9 at freeze.
Team: Victor is on NWS, Alejandro on historical data (much of it on origin/ale-dev, not merged), Christian on the
appliance scan. Tell Christian through the playbook, don't edit his screens.

## What a fresh clone is missing
- Secrets: set XAI_API_KEY as an environment variable in the session settings (never commit it). Without it the
  narrator falls back to its template and says so. Supabase keys are only needed to sign in to the web app.
- Raw data (data/raw, gitignored): EAGLE-I Texas CSVs, ERCOT load profiles and their parquet cache, ERCOT prices,
  EIA-861, ACS, NRI. Tests and the API do not need them. Rebuilding the pipeline does: `make download` then
  `make build` (downloads are large; the EAGLE-I step fetches national files).
- Heavy jobs: pipeline.features (~45 s), pipeline.statewide (~6 min), evals.record (~1.5 min, calls Grok).
