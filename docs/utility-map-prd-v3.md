# Utility Map PRD 3.0

**Status:** Draft for review, September 26, 2026. Supersedes [PRD v2](utility-map-prd-v2.md) where they differ; v2 still governs the data-contract rules this document does not change (null handling, provenance, no fake zeros, labels).
**Owner:** Alejandro, end to end: data acquisition, normalization, scoring, export and map UI.
**Ticket plan:** [utility-map-roadmap.md](utility-map-roadmap.md).
**Related:** [battery facts](battery-tech-specs.md), [style guide](base-power-styleguide.md), [Present-mode spec (postponed)](superpowers/specs/2026-09-26-utility-map-present-mode-design.md).

## 1. What changed from v2

| Topic | v2 | v3 |
|---|---|---|
| Dependencies | Nolan delivers outage and coverage tables; Victor delivers live NWS/ERCOT adapters | **Self-sufficient.** We download and normalize every source ourselves. We may *import* already-merged pipeline code (e.g. `pipeline/events.py`) but never wait on a new handoff. |
| Grid consumption and capacity | Out of scope (peak-demand ratio was roadmap item R02) | **Core.** Per-utility sales and peak demand (EIA-861), local generation capacity (EIA-860), zone load (ERCOT). |
| Base "stabilize the grid" | Fleet MWh/MW numbers in a side panel | **A map mode.** Fleet MW as a share of each utility's peak, backup hours covered in long outages, and supply during price-spike hours. |
| Hazards | One "weather" index and one "flood" index from FEMA NRI | **Separate, real event layers:** flood zones (FEMA NFHL polygons), tornadoes (SPC tracks), hail and wind (SPC reports), hurricanes (NHC HURDAT2), winter and heat events (NOAA Storm Events). Shown as heatmaps and combined into an overlap score. |
| Stress lenses | Winter, Hurricane, Summer presets over 5 layers | Five lenses (Winter freeze, Hurricane season, Summer peak, Severe storms, All hazards) over 13 layers. |
| Live conditions | Victor's adapter | Our own Next route calling the NWS API (no key). ERCOT live is optional. |
| Geography | All of Texas | County-level indices for **all 254 counties** (the sources are statewide files anyway). Heavy polygon layers (flood zones) start with **5 demo counties**. |

## 2. Product in one paragraph

A Base sales rep opens `/utility-map`, picks a lens (say *Hurricane season*), and sees Texas colored by how much hazards overlap in each county and utility territory, with a heatmap of the actual historical events underneath. They click a utility and see its grid numbers (sales, peak demand, local generation), the evidence behind its score, and what a Base fleet of 1%, 5% or 10% of its homes would add: megawatts at peak, backup hours in long outages, and supply during price spikes. Every number shows its source and period and says "estimate" where it is one.

## 3. Demo counties

Statewide county indices ship first. Where a layer is too heavy for statewide delivery before the deadline, these five counties go first. They cover four utilities, one expansion target, the coast and the three persona counties.

| County | FIPS | Main utility | Why |
|---|---|---|---|
| Harris | 48201 | CenterPoint | Houston; Beryl and Uri; persona county |
| Galveston | 48167 | CenterPoint, TNMP | Coast: hurricane, surge, flood |
| Travis | 48453 | Austin Energy | Municipal utility; persona county |
| Collin | 48085 | Oncor | North Texas; Uri; persona county |
| Nueces | 48355 | AEP Texas Central | Base sells energy only here: an expansion target |

## 4. Map modes

A segmented control at the top of the controls panel. One mode is active at a time; the lens and fleet share carry across modes.

| Mode | Answers | What's drawn |
|---|---|---|
| **Risk** (default) | Where do hazards and grid stress overlap? | County or utility choropleth of the composite score (orange ramp, levels 1–5). Utility outlines. |
| **Heatmap** | Where did the events actually happen? | Mapbox `heatmap` layer from event points (tornado touchdowns, hail and wind reports, hurricane track points, Storm Events locations) weighted by severity. Flood-zone polygons when zoomed into a demo county. |
| **Grid** | How big is this grid and how much generation sits inside it? | County choropleth of estimated peak demand (MW); generator circles sized by MW and colored by fuel; side panel shows sales, peak, local generation and the gap. |
| **Base fleet** | What would Base add? | Utility choropleth (green ramp) of fleet MW as a percentage of the utility's summer peak for the chosen fleet share; side panel shows the fleet math. |

## 5. Layers (toggles)

All county values are annualized over a pinned window and ranked against Texas (0–1 percentile, average ties, `(rank-1)/(n-1)`, null when fewer than two valid values). Ranks drive color; the physical value is always shown next to it.

### Grid group

| ID | Label | Value (unit) | Source | Window |
|---|---|---|---|---|
| `peak_demand` | Peak demand | Estimated county summer peak, MW | EIA-861 Operational_Data utility summer peak × county customer share; ERCOT weather-zone peak where EIA is blank | 2024 |
| `generation` | Local generation | Operating nameplate capacity in the county, MW | EIA-860 generators + plants | 2024 |
| `price_spikes` | Price spikes | Hours/year with real-time price ≥ $1,000/MWh in the county's load zone | ERCOT RTM SPP (already downloaded) | 2019–2024 |
| `outages` | Long outages | Customer-hours in outages ≥ 12 h, per customer per year | EAGLE-I (already downloaded), our own computation | 2018–2024 |

### Hazard group

| ID | Label | Value (unit) | Source | Window |
|---|---|---|---|---|
| `flood` | Flood | Statewide: flood and flash-flood events per year + FEMA NRI inland/coastal flood score. Demo counties: % of land in the FEMA 1%-annual-chance floodplain | NOAA Storm Events; FEMA NRI (staged); FEMA NFHL | 2000–2024 |
| `tornado` | Tornadoes | EF-weighted tornado path length per 1,000 km² per year | NOAA SPC tornado database | 2000–2024 |
| `severe_storm` | Hail and wind | Severe hail (≥1") and wind (≥58 mph) reports per 1,000 km² per year | NOAA SPC reports | 2000–2024 |
| `hurricane` | Hurricanes | Tropical-storm-or-stronger tracks passing within 100 km, per decade, wind-weighted | NHC HURDAT2 | 1980–2024 |
| `winter` | Winter freeze | Winter storm, ice storm, extreme cold and frost/freeze event-days per year | NOAA Storm Events | 2000–2024 |
| `heat` | Extreme heat | Heat and excessive-heat event-days per year | NOAA Storm Events | 2000–2024 |

### Exposure

| ID | Label | Value | Source |
|---|---|---|---|
| `homes` | Homes exposed | Owner-occupied detached single-family homes | ACS 2020–2024 B25032_003E |

Non-ERCOT counties get `price_spikes` = not applicable (never zero). Missing means missing: a county with no data for a layer is left out of that layer's ranking and shown as "no data".

## 6. Lenses (presets)

| Lens | Layers |
|---|---|
| Winter freeze | `winter`, `outages`, `price_spikes`, `homes` |
| Hurricane season | `hurricane`, `flood`, `outages`, `homes` |
| Summer peak | `heat`, `peak_demand`, `price_spikes`, `homes` |
| Severe storms | `tornado`, `severe_storm`, `outages`, `homes` |
| All hazards | `flood`, `tornado`, `severe_storm`, `hurricane`, `winter`, `heat` |

Any manual toggle change shows "Custom" unless it matches a lens exactly.

## 7. Scoring and hazard overlap

1. **County score** = mean of the active layers' Texas ranks, over layers valid for that county. If scarcity is active, ERCOT and non-ERCOT counties are ranked as separate peer groups.
2. **Overlap count** = number of active *hazard* layers where the county is in the top fifth of Texas. Shown as "Top-fifth in 3 of 6 hazards." This is the literal "more overlap, more risk" signal and is displayed next to the score, not blended into it.
3. **Utility score** = mean of its counties' scores weighted by the utility's *estimated customers in each county* (EIA-861 membership + IPF split), never the county's full customer count.
4. **Levels 1–5** = quintiles within the peer group.
5. **Validation, required before the demo:** Spearman correlation between each hazard layer and the `outages` layer across counties, published in the methods note. If a hazard does not track outages, we say so rather than imply it causes grid failure.

**Language rule:** the score is a *relative screening index of hazard exposure and grid stress*, not a probability that the grid fails. The UI never says "chance of failure".

## 8. Base fleet logic ("stabilize the grid")

Inputs per Core, from [battery-tech-specs.md](battery-tech-specs.md): 39.2 kWh, 20 kW, ~20% backup reserve. Base reports typical whole-home backup of 12–18 h. We use 12 h (conservative) for outage coverage.

For fleet share `s` of utility `u`:

```text
homes_u        = Σ_c detached_owner_homes_c × share_uc          # estimated split, per county
N              = round(s × homes_u)                              # Cores, one per home
storage_MWh    = N × 39.2 / 1000
nameplate_MW   = N × 20 / 1000                                   # upper bound
usable_kWh     = 39.2 × (1 − 0.20) = 31.36
dispatch_MW_2h = N × min(20, 31.36 / 2) / 1000 = N × 15.68 / 1000   # 2-hour peak window, energy-limited
peak_share     = dispatch_MW_2h / summer_peak_MW_u               # headline for Base fleet mode
backup_hours   = Σ_c N_c × long_outage_hours_per_customer_c × coverage_c
coverage_c     = Σ_events min(d, 12 h) × customers / Σ_events d × customers   # over outages ≥ 12 h, from EAGLE-I
spike_MWh      = dispatch_MW_2h × 2                              # energy per price-spike event, shown next to the zone's spike hours/yr
```

Worked example (Oncor, 1%, with today's home count of 1.53M): about 15,300 Cores → 600 MWh stored, 307 MW nameplate, 240 MW over 2 h ≈ 0.8% of Oncor's 30,510 MW 2024 summer peak. At 10% ≈ 8%.

Labels: "idealized, energy-limited ceiling; assumes full charge and 20% reserve; not a dispatch commitment." No dollar values. No claim of feeder or substation relief.

## 9. Data rules carried from v2

- Five-digit string FIPS; EIA utility number as the utility key; UTC in storage, Central in the UI.
- Null plus a reason (`missing`, `not_applicable`, `suppressed`); measured zero stays zero.
- Every release has `release_id`, `schema_version`, per-layer `period_start/end`, `source_ids`, a `manifest.json` with URL, retrieval time and SHA-256 for each raw file, and a gate report.
- Raw downloads live in `data/raw/<source>/` (gitignored). Normalized tables go to `data/processed/utility_map/*.parquet`. Published aggregates go to `public/utility-map/releases/<release_id>/` with `public/utility-map/current.json` pointing at the latest valid one.
- Counties served by several utilities (250 of 254) keep every membership. The map paints statewide by the largest-share utility and offers a picker on click.
- Unknown Base offer shows "Offer not verified", never "Base doesn't serve".

## 10. Out of scope for the hackathon

Statewide flood-zone polygons, precise utility service polygons, live ERCOT grid conditions, 72-hour forecasts, storm replay timeline, paid live outage feeds, feeder-level relief, Present mode and phone layout. They stay on the roadmap (Phase 7).

## 11. Definition of done (demo)

- `/utility-map` loads a real release by default; the mock is only reachable with `?data=mock`.
- All 13 layers either show real data with source and period, or are visibly disabled with the reason.
- The five lenses, four modes and 1/5/10% fleet shares work for every utility; the five demo counties show flood-zone polygons.
- Gate report passes (Section 9 and the roadmap's Phase 6 checks); `python -m pytest -q`, `npm run lint`, `npm run build` pass.
