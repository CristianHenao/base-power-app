# Demo script v1 (V-01), 5:00

Every number below comes from the pipeline and is checked in `docs/persona-check.md`.
Rerun `python -m pipeline.persona_check` after any rebuild and update this file before recording.
Say "homes in [county]" for outage numbers, never "your home". Call every estimate an estimate.

Numbers confirmed against the live report at 5:30 PM Saturday (Nolan). "90% of homes back within" is a
band: the low end lets homes take turns being dark, the high end keeps the same homes dark. Quote the
upper end or say "up to". Sizing percentages truncate on purpose, so 89.8% never reads as meeting the
90% target. The step-by-step checklist for the run-through is `docs/run-through.md`.

## Personas (data/reference/personas.yaml)

| | Sally | Thomas | Third persona (name TBD) |
|---|---|---|---|
| Where | Plano 75025, Collin County | West Houston 77084, Harris County | South Austin 78745, Travis County |
| Utility | Oncor (confirm step also shows two co-ops) | CenterPoint | Austin Energy |
| Base offer | Energy + Backup | Energy + Backup | Backup through the utility program |
| Home | Electric heat | Gas heat | Gas heat |
| Outlook (12h+ outages) | Elevated, about once every 10 years | High, about once every 5 years | Elevated, about once every 10 years |
| Hero storm | Winter Storm Uri, Feb 2021 | Hurricane Beryl, Jul 2024 | Winter Storm Mara ice storm, Feb 2023 |
| Homes out at peak | 143,803 (34% of the county) | 1,660,703 (91%) | 185,025 (29%) |
| 90% of homes back within | 42-73 hours | 115-175 hours (up to about a week) | 115-132 hours |
| One Core / two Cores, that week (estimate) | 9 h / 15 h (electric heat, about 4.6 kW average) | 20 h / 38 h | 33 h / 69 h |
| One Core, February / August (estimate) | 28 h / 17 h | 41 h / 15 h | 44 h / 17 h |
| Recommendation | 2 Cores (51% of past 12h+ outage hours) | 2 Cores (46%) | 2 Cores (89%) |
| Backup gap, dark hours a year: none / one Core / two (estimate) | 5.9 / 1.7 / 1.1 | 14.2 / 8.1 / 6.4 | 5.5 / 1.1 / 0.4 |

## Script

| Time | On screen | Say |
|---|---|---|
| 0:00-0:20 | Type Sally's address; the report appears | "Base's compare page tells Texans what they'd save. We built the other half: will the lights stay on?" |
| 0:20-0:45 | Sally and Thomas side by side | "Same state, same battery, very different answers. It depends on the county, the season and the home." |
| 0:45-1:25 | **Sally.** Outlook badge, then the Uri replay: county outage curve against one and two Cores | "Homes in Collin County see a 12-hour-plus outage about once every 10 years. But when Uri hit, a third of the county went dark, and the last tenth of homes waited up to 73 hours. Sally heats with electricity, so in that week one Core lasts about 9 hours. Two get her to about 15. Every number here is an estimate from public data." |
| 1:25-1:55 | **Thomas.** Hurricane-heavy mix, Beryl replay, backup by month showing August | "Harris County is the opposite: high risk, about once every 5 years. Beryl knocked out 91% of the county, and the last homes waited up to about a week. In August, air conditioning cuts one Core to about 15 hours. Add it up and a typical home here is dark about 14 hours a year; one Core cuts that to about 8. Star the fridge and a CPAP, and those stay on for all but about 16 minutes a year. That's computed on the phone; the list never leaves it." |
| 1:55-2:15 | **Third address.** Austin Energy; the report says backup comes through the utility program | "In Austin, Base works through the city utility, so the offer is backup only. The longest outage here wasn't Uri. It was the 2023 ice storm: the last tenth of homes waited up to about 130 hours." |
| 2:15-3:15 | Architecture; duration band chart; backtest; narrator validators and pass rate; latency and load test; kill NWS and the LLM live while the report keeps rendering | "Here's what's under the hood and why it holds up." (Nolan, Victor) |
| 3:15-4:15 | Three insight charts (see below) | "What we saw in Texas grid data that most people miss." |
| 4:15-4:45 | API docs, the widget on a mock of Base's compare page, then the sales map (P-04) | "Base could ship this tomorrow. And the same data gives Base's sales team a map of where utilities are under stress." |
| 4:45-5:00 | Four faces, one line each; repo URL | Christian: "I designed and built the report and the map." Victor: "I built the platform and made it fail gracefully." Nolan: "I built the outage models, the simulator and the guarded narrator." Alejandro: "I built the data pipeline and ran the story with Base's engineers." |

## Insight charts (pick three with Nolan)

1. **Scarcity is disappearing.** Hours above $1,000/MWh in every ERCOT load zone: about 160 in 2021, about 60 in 2023, 2-8 in 2025. Prices barely differ between zones. (Confirmed on the corrected LZ prices, 27843d5.)
2. **The tail is the product.** Nolan's tail share: a handful of storms make up most of each county's outage hours, so backup is sold on hours, not averages.
3. **Same Core, different month.** Nolan's backup-by-month: one Core lasts far longer in February than in August for a gas-heat home, and the reverse for electric heat in a freeze.
4. **Uri wasn't the worst everywhere.** In Travis, the 2023 ice storm left the last tenth of homes waiting up to about 130 hours, longer than Uri (up to about 96). In Harris, Beryl put 91% of the county out.
5. **Official reliability leaves out the storms.** Dropping major event days removes 66-92% of the outage minutes customers lived through, 2019-24 (EIA-861; `public/insights/reliability_med.svg`).

## Recording notes

- Record in segments at 1080p with a real microphone; pre-fill the inputs so there's no typing lag; add captions.
- Pull any statistic in the voiceover from `docs/persona-check.md`, not from memory.
- Safety video by 10:30 PM Saturday, uploaded unlisted.

## Utility map (Base sales), 60 seconds

Open `/utility-map` at laptop width. Everything on screen is from public data; the stamp says "Partial release · estimates".

| Time | On screen | Say |
|---|---|---|
| 0:00-0:10 | Grid Risk Index, 3D on, open CenterPoint | "Every Texas county and utility gets one Grid Risk Index, 1 to 100, from nine public sources: half hazard exposure, half grid stress. CenterPoint: 98, fourth of 150." |
| 0:10-0:25 | Explore hazards → Historical patterns: turn off Winter freeze, pick Tornadoes + Hurricanes | "Tornado tracks from NOAA, hurricane tracks since 1980. The dark corner is where both run high: East Texas and the upper coast." |
| 0:25-0:35 | Explore hazards → Past storms: Hurricane Beryl | "Beryl put 1.66 million Harris County customers in the dark, 91% of them. That's EAGLE-I, county by county." |
| 0:35-0:45 | Explore hazards → Historical patterns, Flood, open CenterPoint → Harris | "FEMA flood zones for Harris and Galveston; 60% of Galveston is in the 100-year floodplain." |
| 0:45-0:60 | Model Base impact, 10%, open Oncor | "One Core in 10% of Oncor's homes: about 2,400 MW for two hours, 7.9% of its summer peak. And every number has its source one tap away." |

Checks before recording: `make export-map` gate report passes; `npm run test:web`, `python -m pytest -q`, `npm run build` pass.
