import Anthropic from "@anthropic-ai/sdk";
import {
  parseDeviceNameplateResult,
  type DeviceNameplateResult,
} from "@/lib/home/devices";

const DEFAULT_MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You read appliance / device rating labels and nameplates (the sticker on the back or bottom).

Return ONLY a single JSON object (no markdown, no prose) with this shape:
{
  "brand": string | null,
  "model": string | null,
  "description": string | null,
  "inputVoltage": string | null,       // e.g. "120 V"
  "inputFrequency": string | null,     // e.g. "60Hz"
  "inputPhase": string | null,         // e.g. "Single Phase"
  "inputWatts": number | null,         // rated input watts as a number
  "outputWatts": number | null,        // rated output watts if present
  "microwaveFrequency": string | null, // e.g. "2450MHz"
  "manufactureDate": string | null,
  "origin": string | null,             // e.g. "Made in China"
  "manufacturer": string | null,       // company + address if present
  "fccId": string | null,
  "circuitRequirement": string | null, // e.g. "Separate 15 AMP 120 VOLT AC OUTLET"
  "fields": [{ "key": string, "label": string, "value": string }],
  "confidence": number,
  "notes": string | null
}

Rules:
- Prefer exact text from the label (OCR). Do not invent values.
- Put input rated power in inputWatts as a number when the label shows watts (e.g. 1350W → 1350).
- Use fields[] for any extra useful pairs not covered above (date code, access code, certifications, etc.).
- confidence should reflect how readable the plate is.
- If the photo is not a nameplate, return mostly nulls with low confidence and a short notes explanation.`;

export type ScanNameplateImageInput = {
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

export async function readDeviceNameplateFromImage(
  input: ScanNameplateImageInput,
): Promise<DeviceNameplateResult> {
  const client = getAnthropicClient();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const response = await client.messages.create({
    model,
    max_tokens: 1200,
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
            text: "Read this device nameplate / rating label. Extract brand, model, electrical ratings, and other labeled specs. Return JSON only.",
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text.");
  }

  const parsed = parseDeviceNameplateResult(extractJsonObject(textBlock.text));
  if (!parsed) {
    throw new Error("Could not parse nameplate data.");
  }
  return parsed;
}
