import type { Address } from "@/lib/types/domain";
import type { GeocodedLocation } from "@/lib/map/geocode";

export async function geocodeAddressClient(
  address: Address,
  signal?: AbortSignal,
): Promise<GeocodedLocation | null> {
  const response = await fetch("/api/map/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
    signal,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error || `Geocoding failed (${response.status}).`);
  }

  return (await response.json()) as GeocodedLocation;
}

export async function fetchMapboxTokenClient(
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await fetch("/api/map/token", { signal });
  if (!response.ok) return null;
  const payload = (await response.json()) as { token?: string };
  return payload.token ?? null;
}
