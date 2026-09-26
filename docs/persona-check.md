# Persona hand-check

Built by `python -m pipeline.persona_check`. 50 checks, 0 flagged.
Each report number is recomputed from the raw data (EAGLE-I, MCC.csv, ZIP and Base tables) rather than read back from the model. FLAG means look before it goes in the video.

| Persona | Check | Report | Independent | Result | Note |
|---|---|---|---|---|---|
| Sally | ZIP 75025 lists Oncor | True | 3 candidate(s) | ok |  |
| Sally | Base offer | energy_plus_backup | energy_plus_backup | ok |  |
| Sally | Outlook: once every N years | 9.5 | 1 / 0.105 = 9.5 | ok | Elevated; 90% band 0.05-0.18 per year |
| Sally | Winter Storm Uri: peak customers out | 143,803 | 143,803 (raw EAGLE-I max in window) | ok |  |
| Sally | Winter Storm Uri: share of county out | 34.5% | 143,803 / 417,242 = 34.5% | ok |  |
| Sally | Winter Storm Uri: 90% of homes back within | 73 h | event lasted 141 h | ok | a home cannot be out longer than the event |
| Sally | Winter Storm Uri: p90 fits the outage curve | p90 73 h -> average at most 80 h | customer-hours / peak = 44 h | ok | if flagged, durations are too short, or homes rotated (rolling blackouts) |
| Sally | Winter Storm Uri: backup hours, 1 / 2 Cores | 9 / 15 h | implied average load 4.58 kW | ok | 39.2 kWh / hours; a home averages 0.5-4 kW |
| Sally | Memorial Day storms (Dallas derecho): peak customers out | 94,090 | 94,090 (raw EAGLE-I max in window) | ok |  |
| Sally | Memorial Day storms (Dallas derecho): share of county out | 22.6% | 94,090 / 417,242 = 22.6% | ok |  |
| Sally | Memorial Day storms (Dallas derecho): 90% of homes back within | 51 h | event lasted 113 h | ok | a home cannot be out longer than the event |
| Sally | Memorial Day storms (Dallas derecho): p90 fits the outage curve | p90 51 h -> average at most 57 h | customer-hours / peak = 19 h | ok | if flagged, durations are too short, or homes rotated (rolling blackouts) |
| Sally | Memorial Day storms (Dallas derecho): backup hours, 1 / 2 Cores | 23 / 47 h | implied average load 1.67 kW | ok | 39.2 kWh / hours; a home averages 0.5-4 kW |
| Sally | Sizing sentence | Two Cores would have covered 51% of the 12-hour-plus outage ... | stay share 51.6% | ok |  |
| Sally | Backup by month, 1 Core (Feb / Aug) | 28 / 17 h | 2 Cores >= 1 Core every month: True | ok | range 16-35 h |
| Thomas | ZIP 77084 lists CenterPoint Energy | True | 1 candidate(s) | ok |  |
| Thomas | Base offer | energy_plus_backup | energy_plus_backup | ok |  |
| Thomas | Outlook: once every N years | 4.5 | 1 / 0.221 = 4.5 | ok | High; 90% band 0.15-0.31 per year |
| Thomas | Hurricane Beryl: peak customers out | 1,660,703 | 1,660,703 (raw EAGLE-I max in window) | ok |  |
| Thomas | Hurricane Beryl: share of county out | 90.9% | 1,660,703 / 1,827,686 = 90.9% | ok |  |
| Thomas | Hurricane Beryl: 90% of homes back within | 175 h | event lasted 255 h | ok | a home cannot be out longer than the event |
| Thomas | Hurricane Beryl: p90 fits the outage curve | p90 175 h -> average at most 183 h | customer-hours / peak = 83 h | ok | if flagged, durations are too short, or homes rotated (rolling blackouts) |
| Thomas | Hurricane Beryl: backup hours, 1 / 2 Cores | 20 / 38 h | implied average load 1.95 kW | ok | 39.2 kWh / hours; a home averages 0.5-4 kW |
| Thomas | Houston derecho: peak customers out | 291,108 | 291,108 (raw EAGLE-I max in window) | ok |  |
| Thomas | Houston derecho: share of county out | 15.9% | 291,108 / 1,827,686 = 15.9% | ok |  |
| Thomas | Houston derecho: 90% of homes back within | 116 h | event lasted 138 h | ok | a home cannot be out longer than the event |
| Thomas | Houston derecho: p90 fits the outage curve | p90 116 h -> average at most 118 h | customer-hours / peak = 63 h | ok | if flagged, durations are too short, or homes rotated (rolling blackouts) |
| Thomas | Houston derecho: backup hours, 1 / 2 Cores | 20 / 40 h | implied average load 1.95 kW | ok | 39.2 kWh / hours; a home averages 0.5-4 kW |
| Thomas | Winter Storm Uri: peak customers out | 455,986 | 455,986 (raw EAGLE-I max in window) | ok |  |
| Thomas | Winter Storm Uri: share of county out | 24.9% | 455,986 / 1,827,686 = 24.9% | ok |  |
| Thomas | Winter Storm Uri: 90% of homes back within | 51 h | event lasted 94 h | ok | a home cannot be out longer than the event |
| Thomas | Winter Storm Uri: p90 fits the outage curve | p90 51 h -> average at most 55 h | customer-hours / peak = 33 h | ok | if flagged, durations are too short, or homes rotated (rolling blackouts) |
| Thomas | Winter Storm Uri: backup hours, 1 / 2 Cores | 32 / 118 h | implied average load 1.22 kW | ok | 39.2 kWh / hours; a home averages 0.5-4 kW |
| Thomas | Sizing sentence | Two Cores would have covered 48% of the 12-hour-plus outage ... | stay share 48.6% | ok |  |
| Thomas | Backup by month, 1 Core (Feb / Aug) | 41 / 15 h | 2 Cores >= 1 Core every month: True | ok | range 15-42 h |
| Third persona | ZIP 78745 lists Austin Energy | True | 1 candidate(s) | ok |  |
| Third persona | Base offer | backup_program | backup_program | ok |  |
| Third persona | Outlook: once every N years | 9.9 | 1 / 0.101 = 9.9 | ok | Elevated; 90% band 0.07-0.14 per year |
| Third persona | Winter Storm Mara (ice storm): peak customers out | 185,025 | 185,025 (raw EAGLE-I max in window) | ok |  |
| Third persona | Winter Storm Mara (ice storm): share of county out | 28.8% | 185,025 / 641,926 = 28.8% | ok |  |
| Third persona | Winter Storm Mara (ice storm): 90% of homes back within | 132 h | event lasted 184 h | ok | a home cannot be out longer than the event |
| Third persona | Winter Storm Mara (ice storm): p90 fits the outage curve | p90 132 h -> average at most 137 h | customer-hours / peak = 69 h | ok | if flagged, durations are too short, or homes rotated (rolling blackouts) |
| Third persona | Winter Storm Mara (ice storm): backup hours, 1 / 2 Cores | 33 / 69 h | implied average load 1.18 kW | ok | 39.2 kWh / hours; a home averages 0.5-4 kW |
| Third persona | Winter Storm Uri: peak customers out | 273,849 | 273,849 (raw EAGLE-I max in window) | ok |  |
| Third persona | Winter Storm Uri: share of county out | 42.7% | 273,849 / 641,926 = 42.7% | ok |  |
| Third persona | Winter Storm Uri: 90% of homes back within | 96 h | event lasted 164 h | ok | a home cannot be out longer than the event |
| Third persona | Winter Storm Uri: p90 fits the outage curve | p90 96 h -> average at most 103 h | customer-hours / peak = 62 h | ok | if flagged, durations are too short, or homes rotated (rolling blackouts) |
| Third persona | Winter Storm Uri: backup hours, 1 / 2 Cores | 45 / 128 h | implied average load 0.88 kW | ok | 39.2 kWh / hours; a home averages 0.5-4 kW |
| Third persona | Sizing sentence | Two Cores would have covered 89% of the 12-hour-plus outage ... | stay share 89.8% | ok |  |
| Third persona | Backup by month, 1 Core (Feb / Aug) | 44 / 17 h | 2 Cores >= 1 Core every month: True | ok | range 17-44 h |
