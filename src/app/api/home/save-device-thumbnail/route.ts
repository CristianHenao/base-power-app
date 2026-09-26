import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const MAX_BASE64_CHARS = 2_500_000;

type SaveThumbnailBody = {
  deviceId?: string;
  imageBase64?: string;
};

export async function POST(request: Request) {
  let body: SaveThumbnailBody;

  try {
    body = (await request.json()) as SaveThumbnailBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const deviceId = body.deviceId?.trim() ?? "";
  const rawBase64 = body.imageBase64?.trim() ?? "";

  if (!deviceId || !/^[a-zA-Z0-9_-]+$/.test(deviceId)) {
    return NextResponse.json(
      { error: "deviceId must be alphanumeric." },
      { status: 400 },
    );
  }

  if (!rawBase64) {
    return NextResponse.json(
      { error: "imageBase64 is required." },
      { status: 400 },
    );
  }

  if (rawBase64.length > MAX_BASE64_CHARS) {
    return NextResponse.json({ error: "Thumbnail too large." }, { status: 413 });
  }

  const imageBase64 = rawBase64.includes(",")
    ? rawBase64.slice(rawBase64.indexOf(",") + 1)
    : rawBase64;

  try {
    const dir = path.join(process.cwd(), "public", "home", "scans");
    await mkdir(dir, { recursive: true });
    const filename = `${deviceId}.png`;
    const filePath = path.join(dir, filename);
    await writeFile(filePath, Buffer.from(imageBase64, "base64"));

    return NextResponse.json({
      thumbnailUrl: `/home/scans/${filename}`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save thumbnail.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
