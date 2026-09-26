import { NextResponse } from "next/server";
import { uploadHomeDeviceThumbnail } from "@/lib/home/device-storage";
import { createClient } from "@/lib/supabase/server";

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
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Sign in to save device images." },
        { status: 401 },
      );
    }

    const uploaded = await uploadHomeDeviceThumbnail(supabase, {
      userId: user.id,
      deviceId,
      imageBase64,
      contentType: "image/png",
    });

    return NextResponse.json({
      thumbnailUrl: uploaded.thumbnailUrl,
      storagePath: uploaded.storagePath,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save thumbnail.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
