import Anthropic from "@anthropic-ai/sdk";
import {
  parseDeviceScanResult,
  type DeviceScanResult,
} from "@/lib/home/devices";

const DEFAULT_MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You identify home electrical devices, appliances, breaker panels, home batteries, portable/standby generators, and critical medical / medication loads from a photo.

Return ONLY a single JSON object (no markdown, no prose) with this shape:
{
  "name": string,
  "kind": "appliance" | "panel" | "battery" | "generator" | "medical" | "unknown",
  "category": "kitchen" | "living_room" | "bedroom" | "bathroom" | "garage" | "laundry" | "office" | "outdoor" | "panel" | "generator" | "medical" | "other",
  "brand": string | null,
  "model": string | null,
  "watts": number | null,
  "confidence": number,
  "notes": string | null,
  "isMedical": boolean,
  "needsRefrigeration": boolean,
  "bbox": [number, number, number, number] | null
}

Category guidance:
- kitchen: fridge, freezer, microwave, dishwasher, range, etc.
- living_room: TV, soundbar, living-area lamps / fans
- bedroom: bedroom lamps, fans, chargers, bedroom electronics
- bathroom: vanity lights, exhaust, bathroom heaters
- garage: garage fridge, EV charger, tools, freezer in garage
- laundry: washer, dryer
- office: desktop, monitor, modem/router if in office
- outdoor: exterior lights, pool pump, outdoor AC condenser
- panel: breaker / load center only
- generator: portable, inverter, or standby home generators (Honda, Champion, Generac, etc.)
- medical: CPAP/BiPAP, oxygen concentrator, nebulizer, dialysis, powered medical equipment, medication fridge / insulin cooler
- other: when unclear

Critical load rules (prioritize these):
- isMedical=true for any powered medical equipment (breathing, oxygen, dialysis, infusion, etc.). kind should be "medical" and category "medical".
- needsRefrigeration=true when the device must stay powered to keep medication cold (insulin, specialty meds, vaccine/mini fridge used for meds). Mark isMedical=true as well.
- A normal kitchen fridge is category "kitchen", isMedical=false, needsRefrigeration=false unless clearly used for medication.

Other rules:
- Prefer the primary subject in frame, not the whole room.
- Always return bbox tightly around the primary device when visible (normalized 0–1).
- Electrical panel / load center → kind "panel", category "panel", watts null.
- Home battery (Base Core, Powerwall, etc.) → kind "battery".
- Portable / inverter / standby generator → kind "generator", category "generator". For watts, use rated OUTPUT watts when readable (e.g. 3500W, 4500 starting / 3500 running → use running/rated continuous). Null when unsure.
- Never invent precise wattage; use null when unsure.
- Do not invent patient names or medical conditions — describe the device only.
- Confidence should drop when the photo is blurry or ambiguous.`;

export type ScanDeviceImageInput = {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
};

function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing.");
  }
  return new Anthropic({ apiKey });
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model did not return JSON.");
  }
}

export async function identifyHomeDeviceFromImage(
  input: ScanDeviceImageInput,
): Promise<DeviceScanResult> {
  const client = getAnthropicClient();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const response = await client.messages.create({
    model,
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: input.mediaType,
              data: input.imageBase64,
            },
          },
          {
            type: "text",
            text: "Identify the primary home device, appliance, panel, battery, generator, or medical/medication load in this photo. Assign category and medical/refrigeration flags. For generators, prefer rated output watts. Return JSON only.",
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text.");
  }

  const parsed = parseDeviceScanResult(extractJsonObject(textBlock.text));
  if (!parsed) {
    throw new Error("Could not parse device identification.");
  }
  return parsed;
}
