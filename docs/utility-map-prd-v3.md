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
| Hazards | One "weather" index and one "flood" index from FEMA NRI | **Separate, real event layers:** flood zones (FEMA NFHL polygons), tornadoes (SPC tracks), hail and wind (SPC reports), hurricanes (NHC HURDAT2), winter and heat events (NOAA Storm Events). Drawn in their native shapes, aggregated to a hexagon grid, and combined into an overlap view and score (§12). |
| Stress lenses | Winter, Hurricane, Summer presets over 5 layers | Five lenses (Winter freeze, Hurricane season, Summer peak, Severe storms, All hazards) over 13 layers. |
| Live conditions | Victor's adapter | Our own Next route calling the NWS API (no key). ERCOT live is optional. |
| Geography | All of Texas | County-level indices for **all 254 counties** (the sources are statewide files anyway). Heavy polygon layers (flood zones) start with **5 demo counties**. |

## 2. Product in one paragraph

A Base sales rep opens `/utility-map`, picks a lens (say *Hurricane season*), and sees Texas colored by how much hazards overlap in each county and utility territory, with the actual historical storms, tornado tracks and flood zones drawn on top. They click a utility and see its grid numbers (sales, peak demand, local generation), the evidence behind its score, and what a Base fleet of 1%, 5% or 10% of its homes would add: megawatts at peak, backup hours in long outages, and supply during price spikes. Every number shows its source and period and says "estimate" where it is one.

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
| **Hazards** | Where did the events actually happen, and where do two hazards overlap? | Each hazard drawn in its own native shape (flood-zone polygons, tornado tracks, hurricane tracks and wind swaths, hail/wind density hexes). One hazard at a time, or two as a bivariate overlap. See §12. |
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

Statewide flood-zone polygons, precise utility service polygons, live ERCOT grid conditions, 72-hour forecasts, storm replay timeline, paid live outage feeds, feeder-level relief, Present mode and phone layout. deck.gl animation and three.js are also out (see §12.1). They stay on the roadmap (Phase 7).

## 11. Definition of done (demo)

- `/utility-map` loads a real release by default; the mock is only reachable with `?data=mock`.
- All 13 layers either show real data with source and period, or are visibly disabled with the reason.
- The five lenses, four modes (with the §12.4 overlap rules) and 1/5/10% fleet shares work for every utility; the five demo counties show flood-zone polygons; every hazard color appears with its icon.
- Gate report passes (Section 9 and the roadmap's Phase 6 checks); `python -m pytest -q`, `npm run lint`, `npm run build` pass.

## 12. Visualization and design components

### 12.1 Rendering technology

| Option | Verdict | Why |
|---|---|---|
| **Mapbox GL JS v3 (already in the app)** | **Use for everything in the demo** | It already renders the map, labels and county picking. Its native layer types cover every hazard: `fill` (flood zones, counties, hexes), `fill-extrusion` (3D hexes), `line` (tornado and hurricane tracks), `heatmap`, `circle` (generators, hail reports), `symbol` (storm names). Style-guide theming and feature-state painting already work. No new frontend dependency. |
| **deck.gl** (`@deck.gl/mapbox`, interleaved with Mapbox) | Post-demo, only for animation | Worth adding if we build a storm replay: `TripsLayer` animates tracks over time, and GPU aggregation handles hundreds of thousands of raw points. Not needed while the pipeline pre-aggregates. |
| **three.js** | **No** | It's a 3D scene engine, not a map: no projection, basemap, labels, geographic picking or accessibility. We'd rebuild Mapbox by hand. The only 3D effect we want (extruded overlap hexes) is a built-in Mapbox layer type. A Mapbox custom layer could host three.js later for bespoke 3D objects (e.g. a Core model), never for data. |
| Kepler.gl, Leaflet, Google Maps | No | Another map stack beside the one the consumer app uses; nothing they add that Mapbox + pre-aggregation doesn't. |

**Pre-aggregate in Python, draw in Mapbox.** The pipeline turns raw events into small, map-ready files (hex densities, simplified polygons, thinned tracks). The browser never processes raw event tables.

### 12.2 The common grid: H3 hexagons

Counties differ wildly in size (Loving vs. Brewster), which makes raw county maps misleading for hazards. Point, track and polygon hazards are therefore also aggregated to a **statewide H3 hexagon grid at resolution 5** (average cell about 253 km², about 2,800 cells cover Texas). A resolution-6 grid (about 36 km²) is used inside the demo counties.

- Every hex gets, per hazard: a physical value (e.g. EF-weighted tornado path km per 1,000 km² per year) and a Texas rank.
- **Hex overlap count** = number of hex-capable hazards (flood, tornado, hail/wind, hurricane) where the hex is in the top fifth.
- Winter and heat come from county/forecast-zone records, so they stay county-level and are **never faked into hexes or heatmaps**.
- Scores for utilities and counties still come from county values (§7). Hexes are the visual layer.

### 12.3 How each hazard is drawn

| Hazard | Zoomed out (Texas) | Zoomed in (county) | Encoding details |
|---|---|---|---|
| **Flood** | Hex/county choropleth of flood event density (blue sequential) | FEMA flood-zone polygons (demo counties) | Three classes: floodway = darkest blue with diagonal hatch (`fill-pattern`), 1% annual chance (A, AE, AH, AO, VE) = mid blue, 0.2% = light blue. VE (coastal wave action) gets a 1 px outline. |
| **Tornado** | Hex density of EF-weighted path length (purple sequential) | Individual tracks | `line`, start→end, width 1/1.5/2.5/3.5/4.5 px for EF0–EF4+, older tracks at lower opacity. Hover shows date, EF, length, injuries. |
| **Hail and wind** | Hex density of severe reports (amber sequential) | Report points at zoom ≥ 9 | `circle`, radius by hail size or wind speed. Never raw points statewide (about 100k would bury the map). |
| **Hurricane** | Tracks colored by category (teal sequential, TS → Cat 5) plus a light 34-kt wind-swath fill | Same, with the swath edge | Named-storm labels at landfall (`symbol`). Wind swaths use HURDAT2 wind radii (2004 on), else a fixed 150 km buffer, labeled "approximate". |
| **Winter freeze** | County choropleth (ice-blue sequential) | Same | Event-days per year. |
| **Extreme heat** | County choropleth (red sequential) | Same | Event-days per year. |

### 12.4 Showing overlap without mud

Stacking six translucent fills produces mud nobody can read. The rules:

1. **At most one filled layer at full strength.** Everything else on screen is lines, points or outlines.
2. **One hazard** selected → that hazard's native display (§12.3).
3. **Two hazards** selected → a **3×3 bivariate hex map** with a square legend. Stevens palette: `#e8e8e8 #ace4e4 #5ac8c8 / #dfb0d6 #a5add3 #5698b9 / #be64ac #8c62aa #3b4994`. Answers "where do flood and hurricane both run high?" at a glance.
4. **Three or more** (or the All hazards lens) → **overlap count** hexes on the orange risk ramp (0 = no fill, 1–4 = ramp), with the hazard icons of the top-fifth hazards in the tooltip.
5. **3D overlap view** (toggle, pitch 50°): hexes extruded by overlap count, colored by composite score. For the demo video's opening shot; 2D stays the default because it reads more accurately.
6. **Storm spotlight:** picking a named event (Harvey 2017, Ike 2008, Beryl 2024, Uri 2021) draws only that event's footprint over the risk map and lists the affected counties with their EAGLE-I outage peak. Uri has no track, so it highlights its county outage footprint.

### 12.5 Color and icons

Hazard identity colors, validated with the dataviz palette checker (light surface: lightness, chroma, adjacent-pair colorblind separation and 3:1 contrast all pass; dark surface: pass, with flood blue at 2.95:1):

| Hazard | Color | Icon (lucide unless noted) |
|---|---|---|
| Flood | `#2166ac` | `Waves` |
| Hail and wind | `#b07a00` | `CloudHail` |
| Tornado | `#9c3fb0` | `Tornado` |
| Hurricane | `#00897b` | custom spiral SVG |
| Extreme heat | `#d6452b` | `ThermometerSun` |
| Winter freeze | `#5b8fd9` | `Snowflake` |

Heat and hail fail the all-pairs colorblind check, which is why hazards are **never shown as six simultaneous color fills**, and why **every hazard color always appears with its icon and label** (chips, legends, tooltips). Each hazard's single-hazard ramp is five steps of its identity hue, light → dark. The risk score keeps the orange ramp from the style guide; the Base fleet mode uses the style guide's greens; Grid mode uses a grey-blue ramp. So each mode owns one ramp and they never share a screen at full strength.

### 12.6 Component inventory

All components live in `src/components/utility-map/`, use the scoped `.bp-theme` classes, and render at 1024 px width and up.

| Component | Purpose | Notes |
|---|---|---|
| `ModeSwitch` | Risk / Hazards / Grid / Base fleet | Segmented control, keyboard arrows, persists in URL `?mode=` |
| `LensPicker` | Five lenses + Custom | `bp-pill` row |
| `LayerList` | Grouped toggles (Grid, Hazards, Exposure) | Disabled rows show the reason; each row has `EvidencePopover` |
| `EvidencePopover` | Unit, source, period, estimate flag, ok/missing counts, method | Built on `<details>` (no new dependency) |
| `HazardChip` | Icon + color + label | The only way hazard color appears in UI text areas |
| `HazardPicker` | Choose 1–2 hazards (Hazards mode); 3+ switches to overlap | Explains the bivariate/overlap switch in one line |
| `SequentialLegend` | 5-step ramp with end labels and units | Shared by risk, hazard, grid, fleet ramps |
| `BivariateLegend` | 3×3 square with axis labels | Only when two hazards are selected |
| `FloodZoneLegend` | Floodway (hatched), 1%, 0.2% swatches | Shown when flood polygons are visible |
| `SizeLegend` | Circle sizes for generators and hail | |
| `MapTooltip` | Name, level, overlap chips, key value | Follows the cursor, never covers the hovered feature |
| `CountyPicker` | Choose among utilities serving a county | Shows estimated split percentages |
| `HazardFingerprint` | Six mini rank bars with icons for a county or utility | Replaces the generic breakdown for hazards; sorts by rank |
| `GridCard` | Sales, summer peak, local generation, gap | Sources inline |
| `FleetBar` + `FleetStats` | Peak-demand bar with the fleet segment in lime; Cores, MWh, MW for 2 h, backup hours | Uses `fleetScenario` |
| `StormSpotlight` | Named-event picker and affected-county list | |
| `ViewToggle` | 2D / 3D | 3D only in Risk mode with overlap |
| `MethodsSheet` | Sources table, hazard-vs-outage correlations, "view as table" | Slide-over using the existing `sheet.tsx` |
| `DataModeStamp`, `LiveStrip` | Release status and live warnings | From v2 honesty rules |

### 12.7 Map layer order (bottom to top)

Basemap → county choropleth → hex layer (density, bivariate or overlap; extrusions in 3D) → flood-zone fills → hurricane swaths → tracks (hurricane, then tornado) → points (hail/wind, generators) → territory outlines → selection outline → storm labels → basemap place labels (Mapbox `top` slot).

### 12.8 Performance and accessibility budgets

- Initial load ≤ 3 MB compressed; each lazy file ≤ 5 MB (flood per county ≤ 3 MB). Hazard files load when their mode or layer is first used.
- Pan and zoom stay smooth on a 2020-era laptop: at most about 5,000 line features and 20,000 points drawn at once.
- Color is never the only encoding (icons, labels, patterns). Every map view has a table equivalent in `MethodsSheet`. Toggles are keyboard-operable. `prefers-reduced-motion` disables fly-to animation and 3D tilt transitions.
