import Anthropic from "@anthropic-ai/sdk";
import {
  parsePanelDirectoryResult,
  type PanelDirectoryResult,
} from "@/lib/home/devices";

const DEFAULT_MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `You read residential electrical breaker panels (load centers). Focus on breaker slot numbers/positions and the handwritten or printed directory labels that say what each circuit controls.

Return ONLY a single JSON object (no markdown, no prose) with this shape:
{
  "brand": string | null,
  "mainAmps": number | null,
  "spaces": number | null,
  "breakers": [
    {
      "position": string,
      "amps": number | null,
      "label": string,
      "side": "left" | "right" | "center" | "unknown",
      "isMain": boolean,
      "isSpare": boolean,
      "confidence": number
    }
  ],
  "confidence": number,
  "notes": string | null
}

Rules:
- Prefer exact OCR of handwritten / printed directory labels. Do not invent room or appliance names.
- position: the stamped or printed slot number(s). Use "MAIN" for the main breaker. Double-pole / tandem spanning two odd or even slots can be "1/3", "2/4", etc.
- amps: the breaker amp rating when readable (15, 20, 30, 40, 50, 100, 200…). Null when unclear.
- label: what that breaker feeds, from the directory sticker or handwriting. Use "Unlabeled" if the slot has a breaker but no readable label. Use "Spare" for empty spaces or clearly marked spare breakers.
- side: left column, right column, or center (main / single column). unknown if unclear.
- isMain=true only for the main disconnect.
- isSpare=true for empty slots or labeled spare/unused.
- List every visible breaker you can reasonably identify. Skip inventing slots you cannot see.
- confidence (0–1) should drop for blurry handwriting or partial views.
- If the photo is not a breaker panel interior / directory, return breakers: [] with low confidence and a short notes explanation.`;

export type ScanPanelImageInput = {
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

export async function readPanelDirectoryFromImage(
  input: ScanPanelImageInput,
): Promise<PanelDirectoryResult> {
  const client = getAnthropicClient();
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const response = await client.messages.create({
    model,
    max_tokens: 2500,
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
            text: "Read this breaker panel. Extract each breaker’s position/number, amp rating when visible, and the handwritten or printed label for what it controls. Return JSON only.",
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text.");
  }

  const parsed = parsePanelDirectoryResult(extractJsonObject(textBlock.text));
  if (!parsed) {
    throw new Error(
      "Couldn’t read breakers from that photo. Try a clearer shot of the directory labels.",
    );
  }
  return parsed;
}
