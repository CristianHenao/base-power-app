# Narrator evals

24 fixtures: 8 counties, one per ERCOT weather zone, by 3 homes. An output passes when every number matches a cited fact, no banned phrase appears, the reading grade is 7 or lower, and the length caps hold.

| Source | Cases | Passed | Pass rate | Most common failure |
|---|---|---|---|---|
| grok-4.20-0309-non-reasoning | 24 | 21 | 88% | number out of context (2) |
| grok-4.20-0309-non-reasoning+retry | 24 | 24 | 100% | none |
| template | 24 | 24 | 100% | none |
