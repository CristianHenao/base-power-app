import type { Level, ScoreModel } from "./scoring.ts";
import type { CountyRecord, UtilityRecord } from "./types.ts";

/**
 * Selection rules for counties served by several utilities (250 of 254 in Texas).
 * Statewide, a county shows its largest utility; a selected utility claims every
 * county it serves; a click on a shared county asks which utility is meant.
 */

export type CountyPaintState = { level: Level | null; dim: boolean; inSelection: boolean };

function serves(utility: UtilityRecord | undefined, fips: string): boolean {
  return utility?.counties.includes(fips) ?? false;
}

export function countyPaintState(
  county: CountyRecord,
  utilities: Map<string, UtilityRecord>,
  selectedUtilityId: string | null,
  model: ScoreModel,
): CountyPaintState {
  if (selectedUtilityId == null) {
    const primary = county.primary_utility ?? county.utilities[0];
    return { level: model.utility.get(primary)?.level ?? null, dim: false, inSelection: false };
  }
  if (serves(utilities.get(selectedUtilityId), county.fips)) {
    return { level: model.county.get(county.fips)?.level ?? null, dim: false, inSelection: true };
  }
  const primary = county.primary_utility ?? county.utilities[0];
  return { level: model.utility.get(primary)?.level ?? null, dim: true, inSelection: false };
}

export type ClickTarget =
  | { kind: "county"; fips: string }
  | { kind: "utility"; id: string }
  | { kind: "picker"; fips: string };

export function clickTarget(
  county: CountyRecord,
  selectedUtilityId: string | null,
  utilities: Map<string, UtilityRecord>,
): ClickTarget {
  if (selectedUtilityId && serves(utilities.get(selectedUtilityId), county.fips)) {
    return { kind: "county", fips: county.fips };
  }
  if (county.utilities.length > 1) return { kind: "picker", fips: county.fips };
  return { kind: "utility", id: county.utilities[0] };
}

export type PickerOption = { id: string; name: string; share: number | null };

export function pickerOptions(county: CountyRecord, utilities: Map<string, UtilityRecord>): PickerOption[] {
  return county.utilities
    .map((id) => {
      const utility = utilities.get(id);
      const weight = utility?.county_weights.find((w) => w.fips === county.fips);
      return { id, name: utility?.name ?? id, share: weight?.share ?? null };
    })
    .sort((a, b) => (b.share ?? 0) - (a.share ?? 0));
}

const TOOLTIP_OFFSET = 12;

/** Place the tooltip below-right of the cursor, flipping so it never leaves the map. */
export function tooltipPosition(
  x: number,
  y: number,
  box: { width: number; height: number },
  view: { width: number; height: number },
): { left: number; top: number } {
  const left = x + TOOLTIP_OFFSET + box.width > view.width ? x - TOOLTIP_OFFSET - box.width : x + TOOLTIP_OFFSET;
  const top = y + TOOLTIP_OFFSET + box.height > view.height ? y - TOOLTIP_OFFSET - box.height : y + TOOLTIP_OFFSET;
  return { left, top };
}
