import { NextResponse } from "next/server";
import { readDeviceNameplateFromImage } from "@/lib/home/scan-nameplate";

const MAX_BASE64_CHARS = 5_000_000;

type ScanNameplateBody = {
  imageBase64?: string;
  mediaType?: string;
};

const ALLOWED_MEDIA = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(request: Request) {
  let body: ScanNameplateBody;

  try {
    body = (await request.json()) as ScanNameplateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawBase64 = body.imageBase64?.trim() ?? "";
  const mediaType = body.mediaType?.trim() ?? "image/jpeg";

  if (!rawBase64) {
    return NextResponse.json(
      { error: "imageBase64 is required." },
      { status: 400 },
    );
  }

  if (rawBase64.length > MAX_BASE64_CHARS) {
    return NextResponse.json(
      { error: "Image is too large. Capture again closer / lower quality." },
      { status: 413 },
    );
  }

  if (!ALLOWED_MEDIA.has(mediaType)) {
    return NextResponse.json(
      { error: "mediaType must be jpeg, png, webp, or gif." },
      { status: 400 },
    );
  }

  const imageBase64 = rawBase64.includes(",")
    ? rawBase64.slice(rawBase64.indexOf(",") + 1)
    : rawBase64;

  try {
    const nameplate = await readDeviceNameplateFromImage({
      imageBase64,
      mediaType: mediaType as
        | "image/jpeg"
        | "image/png"
        | "image/webp"
        | "image/gif",
    });
    return NextResponse.json({ nameplate });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Nameplate scan failed.";
    const status = message.includes("ANTHROPIC_API_KEY") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
