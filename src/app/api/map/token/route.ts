import { NextResponse } from "next/server";
import { getMapboxToken } from "@/lib/map/config";

export async function GET() {
  const token = getMapboxToken();
  if (!token) {
    return NextResponse.json(
      { error: "Mapbox access token is not configured." },
      { status: 500 },
    );
  }

  return NextResponse.json({ token });
}
