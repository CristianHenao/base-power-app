# Utility map: one question, one answer (coherent views)

Status: approved in chat 2026-09-26. Source: QA report (Q01–Q10, UX 1–13), scope "coherence + menu".

## Problem
Two selections drive the screen: `activeLayers`/lens (score, details, table) and `hazardPicks` (Hazards map);
the storm spotlight paints over both; Grid ignores its checkboxes; only `mode` survives a reload. A rep can pick
one question, see a map answering another, and open details answering a third.

## Goal
The selected question, controls, caption, legend, map, tooltip, details and table always describe the same result,
and a copied URL reproduces it.

## Part 1: one view state (`src/lib/utility-map/view.ts`, pure, Node-tested)

```ts
type Question = "opportunities" | "hazards" | "grid" | "fleet";
type ViewState = {
  question: Question;
  scenario: string | null; factors: LayerId[];            // Find opportunities (scenario = preset id; null = customized)
  hazardSub: "patterns" | "storm"; hazards: HazardId[]; storm: string | null;  // Explore hazards
  demand: boolean; plants: boolean;                       // Understand the grid
  share: 0.01 | 0.05 | 0.1;                               // Model Base impact
  utility: string | null; county: string | null;          // place, shared by every view
};
```

- Each view remembers its own settings; switching question never erases another view's.
- Transitions: `selectScenario`, `toggleFactor`, `toggleHazard`, `showStorm`, `showPatterns`, `setQuestion`,
  `setGridLayer`, `setShare`, `selectUtility`, `selectCounty`.
- Entering Explore hazards with no hazards seeds the scenario's hazards (else Flood). Deselecting the last hazard
  leaves an explicit empty state (grey map, "Pick a hazard"), never the screening score.
- Picking a storm switches the sub-view to Past storms; "Historical patterns" restores the hazards as they were.
- URL: `?q=hazards&sub=storm&storm=Beryl&utility=…&county=…&share=0.05`, defaults omitted. `viewFromUrl` validates
  every value against the data and accepts the legacy `?mode=` (risk → opportunities).
- The FEMA weather composite is no longer offered as a factor (the event-based hazards replaced it).

`describeView(state, ctx)` returns everything the screen shows:
`caption` (headline + qualifier), `legend` (sequential | bivariate | empty), `levelFor(county)` and `tooltip`,
`scoreLayers` (what ranks utilities), `detailLayers` (rows in the details), `table` (caption, columns, all rows).

| View | Caption | Map | Details | Table |
|---|---|---|---|---|
| Find opportunities | "Screening score · average Texas rank of N factors" | quintile score | factors | all utilities × factors |
| Patterns, 1 hazard | "Flood · Texas rank in fifths" | hazard fifths | selected hazards | all utilities × hazards |
| Patterns, 2 | "Flood × Hurricanes · each in thirds" | 3×3 | selected hazards | same |
| Patterns, 3+ | "High in how many of N selected hazards" + "historical relative exposure, not the odds of events at once" | top-fifth count | named: "High in 2 of 3: Flood, Hurricanes" | same |
| Past storm | "Beryl 2024 · Peak customers without power (%)" | outage bins | storm impact for the county / utility's counties; long-term context collapsed | counties hit, by peak % |
| Grid | "Summer peak demand (estimated) · Texas fifths" or "Power plants" | demand fifths if on, else neutral | peak demand, generation | all utilities × peak, generation |
| Fleet | "5% Base fleet · share of summer peak for 2 h" | fleet bins | fleet card first, at every level | all utilities × fleet MW, % of peak |

## Part 2: menu and layout
- Top of the panel: "What do you want to understand?" with four question buttons (label + question):
  Find opportunities / Explore hazards / Understand the grid / Model Base impact.
- Only the chosen question's controls show:
  opportunities = scenario pills, applied-factor list, "Customize factors" (collapsed checkboxes), 3D;
  hazards = Historical patterns | Past storms toggle, then hazard chips or the storm list (never both);
  grid = Demand shading and Power plants switches that really show/hide those layers;
  fleet = 1% / 5% / 10% adoption and the assumptions (39.2 kWh, 20 kW, 20% reserve, 2 h dispatch).
- Live NWS warnings stays a separate toggle with a status line (count, checked at, or unavailable).
- A map key card sits on the map (not below the menu): caption + legend (+ flood zones / plant sizes when shown).
- Labels: "Homes exposed" → "Potential homes" (owner-occupied single-family homes, not homes inside a footprint).
- Narrow screens (< 1024 px): controls and details each scroll inside a capped height so neither collapses,
  and a note says the map is built for desktop.

## Part 3: details and table
- Details read `describeView`: rows are `detailLayers`, the heading names the view ("What drives the score",
  "Selected hazards", "Grid"), and the county hazard line counts exactly the selected hazards and names them.
- Past storm: county shows that storm's peak share out, peak customers out and customer-hours; utility shows its
  counties hit; long-term inputs are in a collapsed "Long-term context".
- Fleet: the fleet card leads the utility view; the county view shows the fleet card for the utility in focus.
- A utility lists all its counties (Show all), sorted by the current view's level.
- The table (Methods → View as table) uses `describeView(...).table`: every row, same columns and caption.
- ⓘ evidence popovers render in a portal (base-ui Popover), so the panel's scroll area never clips them.

## Out of scope (later)
Search, lazy-layer error states, mobile drawer/bottom sheet, saved meeting brief, H3, swaths.

## Tests
`view.test.ts`: URL round-trip for every view, legacy `mode`, invalid values fall back, storm ↔ patterns memory,
empty hazards state, grid switches drive layer visibility, and per view: caption subject, legend, detail rows and
table columns agree; the table holds every utility (or every county hit, for a storm).
