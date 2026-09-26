# What we'd do next

Ordered by what it would change for a Texas homeowner or for Base. Each item says why and where it
starts in the code.

## Make the answer about this home, not a typical one
1. **Smart Meter Texas upload.** Replace the ERCOT load profile with the home's own 15-minute usage,
   parsed in the browser so it never leaves the device. The simulator (`api/app/sim/backup.py`) and the
   household gap already take any load trace; only the input changes.
2. **Appliance scan into the household answer.** Christian's photo scan feeds
   `itemsFromDevices` and `householdAnswer` (`src/lib/report/household-answer.ts`), so starred devices
   come from the scan instead of a checklist. Wiring only; the math is done.
3. **Solar and generators in the simulator.** Solar output by month and a generator topping up the Core
   (4 kW port) both lengthen backup; neither is modeled yet.

## Make the models stronger
4. **Censoring in the duration model.** Outages cut off by a data gap longer than an hour are treated as
   over. A survival fit that treats them as censored would stop understating the longest outages.
5. **The worst storms' tails.** The duration model underestimates Beryl-class hurricanes and 2024-scale
   derechos (tropical p90 119 h predicted vs 154 h observed). Candidates: a heavier-tailed distribution
   (log-logistic or a mixture), or storm-specific covariates such as NHC wind radii and NOAA damage.
6. **Covariates for the level, empirical Bayes for the ranking.** The rolling-origin backtest
   (`backtest.json`, `MODEL_CARD.md`) shows the county-covariate prior predicts the level of outages a
   little better in two of three normal windows, while empirical Bayes ranks counties best in all three.
   A blend could use each for what it does well.
7. **Live storm conditioning.** When NWS issues a hurricane or winter storm warning, show "outages from
   this kind of storm here last p50/p90 hours" from the duration model, and a charge-up prompt.

## Make it run anywhere
8. **A hosted API.** The web app deploys to Vercel but the Python API runs only in compose; today the
   deployed site falls back to the three saved demo reports. Any container host works: the image
   (`api/Dockerfile`) is ready and CI boots it.
9. **One contract.** Merge Victor's `src/lib/types/risk-data.ts` proposal with `api/app/schemas.py`
   (the source of truth, checked by `tests/test_contract_drift.py`).
10. **Utility-level outage feeds.** EAGLE-I is county-level and scraped; utility outage APIs would give
    real restoration times by circuit and remove the ZIP and customer-count workarounds.

## For Base's team
11. **The sales map's fleet overlay and storm replay**, plus detailed flood outlines and wildfire
    (Alejandro's `ale-dev` branch has most of the layers).
12. **CRM-ready leads with consent.** A "have Base contact me" button that sends the household gap
    fields, and contact details only after the homeowner opts in.
