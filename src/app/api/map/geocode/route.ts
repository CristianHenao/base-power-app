import { NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/map/geocode";
import type { Address } from "@/lib/types/domain";

type GeocodeRequestBody = {
  address?: Partial<Address>;
};

export async function POST(request: Request) {
  let body: GeocodeRequestBody;

  try {
    body = (await request.json()) as GeocodeRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const address = body.address;
  if (
    !address?.line1 ||
    !address.city ||
    !address.state ||
    !address.postalCode
  ) {
    return NextResponse.json(
      { error: "Address requires line1, city, state, and postalCode." },
      { status: 400 },
    );
  }

  try {
    const location = await geocodeAddress({
      line1: address.line1,
      line2: address.line2,
      city: address.city,
      state: address.state,
      postalCode: address.postalCode,
      country: address.country || "US",
      latitude: address.latitude,
      longitude: address.longitude,
    });

    if (!location) {
      return NextResponse.json({ error: "Address not found." }, { status: 404 });
    }

    return NextResponse.json(location);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Geocoding failed.";
    const status = message.includes("missing") ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
