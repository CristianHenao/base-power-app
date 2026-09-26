# PRD: Utility risk map for Base sales

> **Implementation successor:** [Utility Map PRD 2.0](utility-map-prd-v2.md) consolidates the source contracts, data architecture, handoffs and validation plan. Alejandro confirmed ownership of the map implementation and final dataset/export assembly on September 26, 2026; this resolves ownership question 7 below. This v1 document is preserved for context.

| | |
|---|---|
| **Status** | Draft for team review. The mockup is live at `/utility-map` on dummy data. |
| **Owner** | Alejandro (data, story). Christian owns the web app and auth. |
| **Last updated** | September 26, 2026 |
| **Related** | Playbook sheet **P-04**, [`docs/battery-tech-specs.md`](battery-tech-specs.md), tickets A6 and A7 in [`docs/alejandro-tickets.md`](alejandro-tickets.md) |

---

## 1. Summary

A map-based **risk profile generator for Base's sales and partnerships team**. A rep opens a map of Texas, switches evidence layers on and off (outages, weather hazard, flood, grid scarcity, homes exposed), and sees which utilities and counties are under the most stress. Clicking a utility shows **why** it scores the way it does and **how much a fleet of Base batteries installed in its homes would ease that stress**. The rep uses it to decide where to pitch and to make the case to a utility partner.

It is a separate experience from the homeowner report (Porchlight) and from the "Pays twice" screen, but it reads **the same data** the team's pipeline builds.

## 2. Problem

- **Base already sells to utilities.** Its utilities page offers peaking capacity, speed to power and distribution grid support, under a utility's own dispatch control, with six utility partners so far.
- **The sales team has no shared, data-backed way to show a utility where its grid is stressed** and what batteries in homes would change. Utilities hold far better internal data (SCADA, outage management systems), so the pitch can't be "we know your grid better than you". It has to be "here is the public evidence, compared across Texas, and here is what a Base fleet does about it".
- **The timing is right.** ERCOT set a load record of 91 GW. Base argues that home batteries deploy in months, where grid-scale projects take years. Base is 71% of ERCOT's ADER pilot (103 of 145 MW). A tool that turns that into a per-utility story helps close partnerships.

## 3. Users and jobs to be done

**Primary user: a Base sales or partnerships rep.**

| Job | What the rep does in the map |
|---|---|
| Decide where to pitch next | Scan the ranked list. **Expansion targets** are high-stress areas where Base sells energy only or doesn't serve today. |
| Prepare for a utility meeting | Open the utility, pick the preset that matches their pain (winter freeze, hurricane season, summer peak), and read the drivers. |
| Make the case in the room | Show the counties driving the score, the live "Right now" strip, and the fleet what-if: "at 1% of your eligible homes, Base adds X MWh and up to Y MW". |
| Defend the number | Open the breakdown: every layer's value, rank, source and as-of date. |

**Secondary audience:** hackathon judges (Base engineers). They see it as a 20–30 second beat in the demo video: "and here's what Base's sales team gets from the same data".

**Not for:** homeowners (they get Porchlight), or utility operators running their own grid.

## 4. Goals, non-goals and success

**Goals**
1. Show, on one map, which Texas utilities and counties are most stressed, by layers the rep can switch on and off.
2. Explain every score: which layers drive it, with values, sources and dates.
3. Quantify what a Base fleet would add for a utility: storage, peak support and outage hours covered.
4. Rank utilities into sales-ready groups: expansion targets, grow, monitor.
5. Run on the team's shared pipeline output, not on its own data.

**Non-goals**
- A live outage map. No free live outage feed exists for Texas.
- Replacing a utility's planning studies. Real siting needs nodal (substation-level) analysis.
- Feeder- or substation-level loading. That data isn't public.
- Anything homeowners see, or targeting individual homes.

**Success**
- *Hackathon:* the thin slice (section 10) runs on real data and appears in the video without breaking.
- *Product:* a rep can build a utility's risk profile and fleet case in under 2 minutes, and answer "where does that number come from?" from the screen alone.

## 5. The experience

### Map and zoom levels
- **Statewide:** every utility territory is drawn and colored by its stress level (1 Low → 5 Very high). Hover shows the utility and level.
- **Utility:** clicking a territory zooms to it. Its counties are colored individually and everything else fades.
- **County:** clicking a county inside the selected utility opens its detail.
- About 10 utilities Base works with are **fully scored**: Oncor, CenterPoint, AEP Texas Central, AEP Texas North, TNMP, Austin Energy, CoServ, GVEC, Farmers EC, El Paso Electric. The rest (e.g. CPS Energy, Pedernales, Entergy Texas, SWEPCO, Xcel) are drawn and colored but open a short **"Base doesn't serve this utility today, expansion candidate"** card.
- The view is a flat 2D statewide map (no 3D buildings or tilt).

### Controls (left panel)
- **Presets:**
  - *Winter freeze:* outages + weather hazard + homes
  - *Hurricane season:* outages + weather hazard + flood + homes
  - *Summer peak:* grid scarcity + weather hazard + homes

  Changing any toggle by hand shows "Custom".
- **Layer toggles:** the five scored layers (section 6).
- **Live NWS warnings:** drawn as dashed outlines, **never part of the score**.
- **Legend:** the 1–5 scale.

### Details (right panel)
1. **Ranked list (default):** scored utilities grouped into **Expansion targets** (high stress, Base sells energy only or not at all), **Grow** (high stress, Base already offers backup), and **Monitor** (lower stress). Each row shows the level chip, Base's offer and eligible homes. Utilities Base doesn't serve are listed below.
2. **Utility view:**
   - level and rank among Texas utilities
   - customers and counties
   - **What drives the score:** one bar per active layer, with its value and rank
   - **Right now:** NWS warnings in the territory, ERCOT conditions, and an as-of time
   - **What if Base were here:** see section 8
   - **Counties, most stressed first**
3. **County view:** level, served-by utility, customers, load zone, per-layer values and ranks, and warnings.

### Copy rules
- Say "stress" or "exposure". Avoid fear words.
- Say "homes in this county", never a single home.
- Label every number an estimate, with a source and an as-of date.
- Say "grid-balancing", not "trading". Say "past storms, replayed", never "live outages".
- Every screen shows a "Mockup · dummy data" badge until real data replaces it.

## 6. Data layers

Every layer has two jobs: **how it's drawn** and **the one number it adds to the score**.

| Layer (toggle) | Question it answers | Source | Drawn as | Score input (per county) | Freshness | Pipeline ticket |
|---|---|---|---|---|---|---|
| **Outage history** | How often and how long do homes here go dark? | EAGLE-I county outages, 2018+ | County colors | Long-outage (12 h+) hours per customer per year | Archive, through 2024 | A1 ✅ (+ Nolan's events) |
| **Weather hazard** | How exposed is the area to winter storms and ice, hurricanes, heat, wind and tornadoes? | FEMA National Risk Index | County colors | Mean of the hazard scores | Yearly | A7 |
| **Flood** | How exposed is it to flooding? | FEMA NRI flood (riverine + coastal) | County colors; detailed flood-zone outlines are week two | Flood score | Yearly | A7 |
| **Grid scarcity** (demand and price surges) | How often is the grid tight here? | ERCOT real-time load-zone prices | Load zones shaded | Scarcity hours per year in the county's load zone | Yearly | A2 (PR #23) |
| **Homes exposed** | How many households are affected? | Census ACS owner-occupied single-family homes | County colors | Eligible homes | Yearly | A7 |
| **Right now** (not scored) | Is anything happening today? | NWS alerts, ERCOT grid snapshot | Warning outlines + strip | None | Minutes | Victor's adapters |

**Geography:**
- *Counties:* Census cartographic county shapes (real in the mockup already).
- *Utility territories:* merge each utility's counties using the **EIA-861 service territory file** (which counties each utility serves, weighted by customers). This is ticket **A6**.
- *Grid boundaries* (ERCOT vs. SPP, MISO, WECC): from the same file.
- Archived HIFLD territory polygons are the more precise option for display only. HIFLD Open shut down in 2025, so copies come from DataLumos or the Data Rescue Project.

**Drawing rules:** county colors for county data, outlines for data with real edges, heatmaps only for dense point data. The palette is the style guide's orange ramp from light to dark; the lightest step is faint, so the level also shows as a number in tooltips and the list.

## 7. Scoring model

1. **Rank each layer against Texas.** For each county and layer, the percentile rank (0 = calmest, 1 = most stressed) among the 254 counties. Counties outside ERCOT have no grid-scarcity value and are skipped for that layer.
2. **County score** = the mean of the ranks of the layers that are on (equal weights).
3. **Utility score** = the customer-weighted mean of its counties' scores.
4. **Levels 1–5** = quintiles: counties against all Texas counties, utilities against all Texas utilities. So "5 · Very high" means the top fifth of peers for the layers on.
5. **Breakdown:** a utility's layer rank is the customer-weighted mean of its counties' ranks. Homes are summed; other values are customer-weighted means.
6. **Groups:** level 3 or higher → *Expansion target* if Base's offer is energy-only or none, *Grow* if Base offers backup (Energy + Backup or a utility backup program). Level 1–2 → *Monitor*.

**Why this design** (from the design review):
- **No free weight sliders.** A rep showing a utility a bad score must be able to say "we didn't weight anything; we chose which evidence to look at."
- **Structural vs. live.** The score comes from history and hazard and changes slowly. Live data sits beside it in the "Right now" strip, so a passing storm doesn't swing the pitch.
- **Rank against peers.** Comparing within Texas is fair and easy to explain in a sales meeting.

Implemented in `src/lib/utility-map/scoring.ts`.

## 8. How a Base fleet eases the stress

The "What if Base were here" panel turns battery specs into a utility-level case. The rep picks a fleet size as a **share of the utility's eligible homes: 1%, 5% or 10%** (starting at 1%). A scale line says "For scale: Base serves 30,000+ homes today."

### The numbers (from [`battery-tech-specs.md`](battery-tech-specs.md))
| Quantity | Formula | Basis |
|---|---|---|
| Homes | eligible homes × share | Census ACS |
| Storage | homes × 39.2 kWh | Core energy |
| Peak support, up to | homes × 20 kW | Core power per Base's utilities page; **upper bound** |
| Energy available to the grid | homes × 39.2 kWh × (1 − 20% reserve) | Base keeps about a 20% backup reserve |
| Sustained support over a dispatch window | min(peak support, grid energy ÷ window hours) | Base dispatches in 1–2 hour windows |
| Outage hours covered per year | homes × long-outage hours per customer × Core coverage share | Nolan's simulator (coverage of long-outage hours by one Core) |

**Worked example (illustrative, not real data):** 10,000 homes store 392 MWh. About 314 MWh sits above the reserve. Over a 2-hour peak window that's about **157 MW sustained**, under the 200 MW power ceiling, so energy is the limit, not power. For scale, Base's whole ADER registration today is 103 MW.

### How it relieves stress, in words the rep can use
- **At peak (grid scarcity):** the fleet discharges for 1–2 hours when demand and prices spike, lowering the load the utility and ERCOT must serve. That's the capacity Base sells as "bulk peaking capacity", under the utility's dispatch control.
- **During outages (outage history, weather, flood):** each home rides through on its own battery, so outage hours covered is a direct reduction in customer darkness.
- **Speed:** home batteries deploy in months (Base energizes about 2 MW a day), versus years for grid-scale projects.
- **Where it matters most:** today ADER settles by load zone. Proposed Phase IV would recognize aggregations nodally, so batteries could target congested substations. Say this as "what this could feed", not a claim.

### Rules for these numbers
- Linear in fleet size (a random rollout). Targeting the most-exposed counties first is week two.
- The MW figure is always labeled "up to".
- Never show prices or dollar values (Base's pricing varies by address).

## 9. Data contract and architecture

**Stack:** same as the homeowner app. Next.js 16 and Mapbox GL 3, reusing `src/components/map/map-view.tsx` (flat view, 3D off). The Mapbox token comes from `/api/map/token`.

**Data flow:** the pipeline (`make data`) exports **one precomputed file per release** plus two shape files. The browser loads them once and computes scores as toggles change, so there's no server call per toggle and no dependency on a FastAPI service. Only the "Right now" strip is live.

```
public/utility-map/<release>/
  utility-map.json      layers, presets, battery facts, live snapshot, counties (values + ranks), utilities
  counties.geojson      Texas county polygons keyed by FIPS
  territories.geojson   one merged outline per utility
```

**`utility-map.json` shape** (types in `src/lib/utility-map/types.ts`):
- `layers[]`: id, label, unit, source, as_of
- `presets[]`: id, label, layers
- `counties[]`: fips, name, utilities, customers, load_zone, centroid, `values{layer}`, `ranks{layer}`
- `utilities[]`: id, name, grid, scored, base_offer, counties, customers, eligible_homes, core_coverage_hours
- `battery`: kwh_per_core, kw_per_core
- `live`: as_of, ercot, alerts

**What exists today** (merged in PR #18):

| Piece | File |
|---|---|
| Route | `src/app/utility-map/page.tsx` |
| Map, layers, interactions | `src/components/utility-map/utility-map-experience.tsx`, `map-layers.ts` |
| Panels | `src/components/utility-map/controls-panel.tsx`, `detail-panel.tsx` |
| Scoring and fleet math | `src/lib/utility-map/scoring.ts` |
| Dummy data generator | `scripts/utility-map/build_mock_data.py` → `public/utility-map/mock/` |

**Going from mock to real:** a pipeline step writes the same three files from real sources (A6 territories and crosswalk; A7 FEMA NRI, EIA-861 and ACS; A1 outages; A2 prices). Swapping the folder in `DATA_BASE` is the only app change needed. The fleet panel should also add the reserve-aware "sustained support" line from section 8.

**Access:** the route sits behind the existing Supabase sign-in (it isn't on the proxy's public list). The P-04 plan to rename it `/sales` and replace the `/crm` scaffold with an email allowlist is still open with Christian.

## 10. Scope and milestones

| Stage | Scope | Status |
|---|---|---|
| **Mockup** | Full experience on dummy data | ✅ Done (PR #18) |
| **Hackathon thin slice** | Real territories (A6), real outage history and weather hazard layers, score and breakdown, "Right now" strip, grouped ranked list. 20–30 s in the video, inside the 4:15–4:45 "how Base ships this" segment. | Next |
| **Full version** | Flood, grid scarcity and homes layers on real data; fleet overlay with reserve-aware sustained support; storm replay on the map | After the slice, if the 7 PM gate is green |
| **Week two** (`docs/NEXT.md`) | 72-hour forecast score; detailed flood zones; wildfire; transmission lines and substations; targeted rollout; paid live outage feed; nodal view | Roadmap |

**Gate rule:** if the homeowner flow isn't solid at the Saturday 7 PM gate, the sales map ships in the video as the clearly labeled mockup.

## 11. Risks

| Risk | Mitigation |
|---|---|
| A score reads as "your grid is bad" and offends a utility | Peer ranking, equal weights, visible drivers and sources, "stress" language |
| County data mistaken for home-level data | "Homes in this county" wording; the county is the smallest unit |
| Territory shapes are approximate (merged counties) | Label them as approximate; HIFLD archive polygons as an upgrade |
| Fleet numbers read as promises | "Up to", "estimate", linear-rollout note, "Base serves 30,000+ homes today" scale line |
| Base facts conflict (power, duration, reserve) | Use the figures in `battery-tech-specs.md`; confirm with Base engineers |
| Demo breaks on camera | Precomputed files, no per-toggle server calls, "Right now" degrades to "unavailable" |
| Vercel and auth block the live demo | Christian adds team members to Vercel and fixes Supabase email |

## 12. Open questions

**For Base engineers**
1. Is 20 kW per Core continuous output or peak? Is two Cores 40 kW?
2. What reserve applies in a fleet dispatch: 20% state of charge, or "5 hours at low usage"?
3. What share of fleet capacity is typically available to a utility partner, and for how long per event?
4. Would the sales team use a utility-level stress view? Which utilities are they talking to now?

**For the team**
5. Route: keep `/utility-map`, or move to `/sales` and replace `/crm` (Christian)?
6. Can EIA-861 supply a peak-demand figure per utility, so the fleet panel can say "X% of your peak"?
7. Who owns the export step that writes the three files: Alejandro (A6/A7) or Nolan?

## Appendix: design review decisions (September 25)

| # | Question | Decision |
|---|---|---|
| 1 | Who is it for? | Base's sales and partnerships team, as a demo of why utilities need Base |
| 2 | What's the story? | Diagnosis, then "what if Base were here" |
| 3 | Which utilities? | All drawn; about 10 Base-relevant ones fully scored; the rest get an expansion card |
| 4 | How do toggles combine? | On/off toggles, equal weights, named presets; no free sliders |
| 4b | Heatmaps? | Only for dense point data; county colors for county data; outlines for areas with edges |
| 5 | First layers? | Outages, weather hazard, flood, grid scarcity, homes exposed; NWS warnings shown but not scored |
| 6 | Fleet slider? | Share of eligible homes (1/5/10%), starting at 1%, with a scale line |
| 7 | Replace "Pays twice"? | No, a separate experience on the same data |
| 8 | County or utility? | Both, as zoom levels |
| 9 | What's "real time"? | Stable structural score plus a separate "Right now" strip |
| 10 | How does the map get data? | One precomputed file; the browser computes scores |
| 11 | Hackathon scope? | Thin slice on real data, 20–30 s in the video |
| 12 | Where does it live? | Behind sign-in (planned `/sales`; built as `/utility-map`) |
| 13 | How are utilities ranked? | By score within Expansion targets / Grow / Monitor; homes as a column |
