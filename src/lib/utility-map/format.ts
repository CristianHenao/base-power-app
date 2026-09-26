import type { MapLayerMeta, Quality, UtilityMapData } from "./types.ts";

/** Display strings for the utility map. Unknown is always said out loud, never shown as zero. */

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatLayerValue(meta: MapLayerMeta, value: number | null, quality: Quality): string {
  if (quality === "not_applicable") {
    return meta.id === "price_spikes" ? "Not applicable outside ERCOT" : "Not applicable";
  }
  if (value == null) return "No data";
  switch (meta.id) {
    case "outages":
      return `${value < 10 ? oneDecimal.format(value) : whole.format(value)} h per customer / yr`;
    case "price_spikes":
      return `${whole.format(value)} h / yr`;
    case "homes":
      return `${whole.format(value)} homes`;
    case "flood":
      return `${oneDecimal.format(value)} flood days / yr`;
    case "winter":
    case "heat":
      return `${oneDecimal.format(value)} event days / yr`;
    case "tornado":
      return `${oneDecimal.format(value)} EF-km / 1,000 km² / yr`;
    case "severe_storm":
      return `${oneDecimal.format(value)} reports / 1,000 km² / yr`;
    case "hurricane":
      return `${oneDecimal.format(value)} passes / decade`;
    case "weather":
      return `${oneDecimal.format(value)} / 100`;
    case "peak_demand":
    case "generation":
      return `${whole.format(value)} MW`;
    default:
      return oneDecimal.format(value);
  }
}

export function formatPeriod(meta: MapLayerMeta): string {
  const year = (iso: string) => iso.slice(0, 4);
  if (meta.period_start && meta.period_end) {
    const [a, b] = [year(meta.period_start), year(meta.period_end)];
    return a === b ? a : `${a}–${b}`;
  }
  if (meta.period_end) {
    return `as of ${MONTHS[Number(meta.period_end.slice(5, 7)) - 1]} ${year(meta.period_end)}`;
  }
  return "period not recorded";
}

export function dataModeLabel(mode: UtilityMapData["data_mode"]): string {
  if (mode === "mock") return "Mockup · dummy data";
  if (mode === "partial") return "Partial release · estimates";
  return "Real data · estimates";
}

export function liveSummary(live: UtilityMapData["live"], fips: string[]): string {
  if (live.status !== "ok") return "Live warnings unavailable";
  const alerts = live.alerts.filter((a) => fips.includes(a.fips));
  if (alerts.length === 0) return "No active NWS warnings";
  const events = [...new Set(alerts.map((a) => a.event))];
  const counties = new Set(alerts.map((a) => a.fips)).size;
  return `${counties} ${counties === 1 ? "county" : "counties"} under ${events.join(", ")}`;
}

export function generationSummary(mix: Record<string, number> | undefined): string | null {
  if (!mix) return null;
  const parts = Object.entries(mix).filter(([, mw]) => mw >= 0.5).sort((a, b) => b[1] - a[1]);
  if (parts.length === 0) return "No power plants";
  const total = parts.reduce((sum, [, mw]) => sum + mw, 0);
  return `${whole.format(total)} MW: ${parts.map(([fuel, mw]) => `${fuel} ${whole.format(mw)}`).join(", ")}`;
}

/** What the map is painting, so the tooltip can say the same thing. */
export type PaintContext =
  | { kind: "risk" }
  | { kind: "fleet" }
  | { kind: "grid" }
  | { kind: "hazard"; label: string }
  | { kind: "bivariate"; first: string; second: string }
  | { kind: "overlap"; of: number }
  | { kind: "storm"; name: string };

const RISK_LABELS = ["Low", "Moderate", "Elevated", "High", "Very high"];
const FLEET_BINS_TEXT = ["< 0.5%", "0.5–1%", "1–2%", "2–5%", "5%+"];
const STORM_BINS_TEXT = ["< 5%", "5–15%", "15–30%", "30–50%", "50%+"];
const FIFTHS = ["lowest fifth", "2nd fifth", "middle fifth", "4th fifth", "top fifth"];
const THIRDS = ["bottom third", "middle third", "top third"];

export function paintLabel(context: PaintContext, level: number | null): string {
  if (level == null) return "No data";
  switch (context.kind) {
    case "risk":
      return `Level ${level} · ${RISK_LABELS[level - 1]}`;
    case "fleet":
      return `${FLEET_BINS_TEXT[level - 1]} of summer peak`;
    case "grid":
      return `Peak demand: ${FIFTHS[level - 1]} of Texas`;
    case "hazard":
      return `${context.label}: ${FIFTHS[level - 1]} of Texas`;
    case "bivariate":
      return `${context.first} ${THIRDS[Math.floor((level - 1) / 3)]} · ${context.second} ${THIRDS[(level - 1) % 3]}`;
    case "overlap":
      return `Top fifth in ${level - 1}${level === 5 ? "+" : ""} of ${context.of} hazards`;
    case "storm":
      return `${context.name}: ${STORM_BINS_TEXT[level - 1]} of customers out`;
  }
}
