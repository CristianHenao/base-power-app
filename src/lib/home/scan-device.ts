import Anthropic from "@anthropic-ai/sdk";
import {
  parseDeviceScanResult,
  type DeviceScanResult,
} from "@/lib/home/devices";

const DEFAULT_MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You identify home electrical devices, appliances, breaker panels, and home batteries from a photo.

Return ONLY a single JSON object (no markdown, no prose) with this shape:
{
  "name": string,              // short product name, e.g. "Refrigerator" or "Square D breaker panel"
  "kind": "appliance" | "panel" | "battery" | "unknown",
  "brand": string | null,      // manufacturer if visible
  "model": string | null,      // model / nameplate if readable
  "watts": number | null,      // typical continuous draw estimate; null for panels or if unsure
  "confidence": number,        // 0–1 how sure you are of the identification
  "notes": string | null,      // one short sentence; mention OCR text if useful
  "bbox": [number, number, number, number] | null
  // normalized [x, y, width, height] relative to image (0–1), primary subject
}

Rules:
- Prefer the primary subject in frame (device/panel), not the whole room.
- If it is an electrical panel / load center, kind must be "panel" and watts null.
- If it is a home battery (Base Core, Powerwall, etc.), kind must be "battery".
- Never invent a precise wattage from thin air; use null when unsure.
- Label confidence honestly (blurry / partial / unclear → lower).`;

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
    max_tokens: 700,
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
            text: "Identify the primary home device, appliance, panel, or battery in this photo. Return JSON only.",
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
