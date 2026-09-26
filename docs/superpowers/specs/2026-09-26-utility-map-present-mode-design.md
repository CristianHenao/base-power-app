# Utility map: Present mode and responsive layout

**Date:** September 26, 2026
**Status:** Design, awaiting review
**Related:** [PRD v2](../../utility-map-prd-v2.md), [PRD v1](../../utility-map-prd.md), style guide work in PR #33

## 1. Intent

A Base sales rep uses the utility map in two moments:

1. **Prep (alone):** decide which utility to approach and what the angle is. That needs exploration: the ranked list, the internal groups, all layer toggles. Today's desktop layout already serves this.
2. **Present (in front of a utility):** show *this* utility where its grid is stressed, why, and what a Base fleet changes. That needs a simple, visual, trustworthy story, with **no internal sales language** on screen.

**Success:** in a meeting, a rep can open a utility and walk through "where, why, what Base does" in under a minute, answer "where does that number come from?" from the screen, and never expose words like "expansion target" or "Base sells energy only here".

**Priority (from the user):** tablet and laptop first, then phone.

## 2. Scope

**Phase 1 (this spec's build): tablet and laptop**
- A **Prep / Present** mode switch.
- **Present mode:** a three-beat story panel for the selected utility (Where, Why, What Base does), a factor focus that recolors the map, evidence details on every number, and a live banner when warnings are active.
- **Layouts:** laptop (1024 px and up) and tablet landscape: the map with a right-side panel. Tablet portrait (768–1023 px): the map on top (about 55%), the panel below (about 45%).
- **Presenter controls:** next/previous buttons, arrow keys (works with slide clickers), a utility switcher.
- **A shareable link** that opens a utility straight in Present mode: `/utility-map?mode=present&utility=oncor`.

**Phase 2 (a later spec): phone**
- A utility picker as the first screen, the three beats in a bottom sheet with snap points, and a layers sheet. Not built now. Phase 1 only guarantees that phones get a usable fallback: the tablet-portrait stacked layout, with nothing covering the map.

**Out of scope:** changes to scoring, data or the pipeline, and new data layers.

## 3. Experience

### Mode switch
- A segmented control in the header: **Prep | Present**. The default is Prep, or Present when the URL says so.
- Entering Present with no utility selected opens a **utility switcher** ("Who are you meeting?") listing utilities by name with their level chip. Nothing is grouped by internal category there.
- Leaving Present returns to Prep with the same utility selected.

### Present panel: three beats
One beat is visible at a time, with a step indicator ("1 Where · 2 Why · 3 What Base does"), next/previous buttons and arrow-key navigation. The map is always visible and changes with the beat.

**Beat 1: Where**
- Map: zoomed to the utility's territory, counties colored by combined score, everything else faded.
- Content: utility name, level chip, and one headline sentence, e.g. "**18 of your 33 counties** are in Texas's top fifth for the factors shown." ("Top fifth" means county level 5.) Below it, the three most stressed counties as tappable rows, which open a county story.
- A **live banner** appears at the top of the panel when NWS warnings are active in the territory: "3 counties under Heat Advisory · as of 10:15 PM CT". It is never part of the score.

**Beat 2: Why**
- One card per active factor, in order of how much each contributes. The rep steps through them with the arrows or by tapping factor chips.
- **Factor focus:** the map recolors counties by that single factor's level, so the rep points at the evidence directly. A "Combined" chip returns to the overall score.
- Each card has a plain sentence built from the data, e.g. "Homes here average **7.8 hours** in long outages a year, more than **85%** of Texas counties", plus a small rank bar.

**Beat 3: What Base does**
- The forest feature card: fleet size pills (1%, 5%, 10% of eligible homes) and three large lime numbers: *peak support up to X MW*, *Y MWh stored*, *Z outage hours covered a year*.
- One line of how-it-works copy: "Batteries charge when power is cheap, discharge for 1–2 hours at peak, and keep a backup reserve for outages."
- A scale note: "For scale: Base serves 30,000+ homes today."

### Evidence on every number
An **ⓘ** next to each number opens a popover with:
- the unit
- the source name
- the observation period or as-of date
- "Estimate" and a one-line method note (e.g. "Customer-weighted average of county values")

In the mockup, it also says "Dummy data".

### Language rules in Present mode
- **Hidden:** rank groups (Expansion targets / Grow / Monitor), Base's offer in that area ("Energy only", "Not served"), "#N of 17", and the "Mockup" stamp. The stamp moves to a small footer note so honesty is kept without dominating the screen.
- **Shown:** "your territory", "homes in these counties", "estimate", with sources one tap away.

### County story
Tapping a county in any beat opens the same three beats for that county, with a "Back to {utility}" link. Beat 3 stays at utility level ("What Base does across {utility}"), because fleet math is per utility.

## 4. Architecture

Everything stays in the existing client component tree. No new routes, API calls or data files.

| Unit | Responsibility | Depends on |
|---|---|---|
| `lib/utility-map/present.ts` (new, pure) | Headline stats, factor sentences, factor ordering, URL state parse/serialize | `scoring.ts`, `types.ts` |
| `lib/utility-map/scoring.ts` (existing) | Add a factor-focus model: levels for one layer, reusing `buildScoreModel(data, [layer])` | none |
| `components/utility-map/present-panel.tsx` (new) | Beat stepper, the three beat views, keyboard navigation | `present.ts`, `LevelChip`, `EvidencePopover` |
| `components/utility-map/evidence-popover.tsx` (new) | ⓘ button and popover with source details | layer metadata |
| `components/utility-map/utility-switcher.tsx` (new) | "Who are you meeting?" list | model |
| `components/utility-map/mode-toggle.tsx` (new) | Prep / Present segmented control | none |
| `utility-map-experience.tsx` (existing) | Owns `mode`, `beat` and `focusLayer` state; syncs mode and utility to the URL; passes the focus model to map painting; picks the layout by breakpoint | the above |
| `detail-panel.tsx`, `controls-panel.tsx` (existing) | Unchanged in Prep. The controls panel is hidden in Present (the factor chips replace it). | none |

**State:** `mode: "prep" | "present"`, `beat: 1 | 2 | 3`, `focusLayer: LayerId | null`, plus the existing selection state. `mode` and `utility` are mirrored to the URL with `router.replace`, with no history spam.

**Map painting:** when `focusLayer` is set, county levels come from the factor-focus model; otherwise from the combined model. Territory and warning layers are unchanged.

**Styling:** everything uses the scoped `.bp-theme` classes from PR #33.

## 5. Edge cases
- **No active layers:** Present still works. Beat 2 shows "Turn on factors in Prep to explain the score", and beats 1 and 3 use whatever score exists or show "No data".
- **Utility with no data for a factor** (e.g. grid scarcity outside ERCOT): that card says "Not in ERCOT's market" and has no bar.
- **Unscored utilities** (Base doesn't serve them): Present still works (useful for expansion pitches). Internal offer labels stay hidden.
- **Invalid `utility` in the URL:** fall back to the switcher.
- **Reduced motion:** no animated transitions between beats.

## 6. Testing
- **Unit tests** for `present.ts` (headline counts, factor sentences, ordering, URL parse/serialize) and the factor-focus model. They use Node's built-in test runner with type stripping via a new `npm run test:web` script. There's no JS test runner in the repo today, and this adds no dependencies.
- **Browser checks** at 1440 × 900, 1024 × 768 (tablet landscape), 768 × 1024 (tablet portrait) and 390 × 844 (phone fallback):
  - Prep is unchanged
  - Present beats step with buttons and arrow keys
  - Factor focus recolors the map
  - Evidence popovers open
  - Internal labels are absent in Present
  - The deep link works
  - Nothing overlaps the map
- `tsc`, eslint and `next build`.

## 7. Delivery
On `ale-dev`, as commits on top of the style-guide work, in a PR to Christian. Phase 2 (phone) gets its own spec after Phase 1 ships.
