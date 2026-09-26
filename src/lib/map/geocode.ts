import { getMapboxToken } from "@/lib/map/config";
import type { Address } from "@/lib/types/domain";
import { formatAddressLine } from "@/lib/onboarding/storage";

type MapboxGeocodeFeature = {
  center: [number, number];
  place_name: string;
};

type MapboxGeocodeResponse = {
  features: MapboxGeocodeFeature[];
};

export type GeocodedLocation = {
  longitude: number;
  latitude: number;
  label: string;
};

export function buildGeocodeQuery(address: Address): string {
  return formatAddressLine(address);
}

export async function geocodeAddress(
  address: Address,
  signal?: AbortSignal,
): Promise<GeocodedLocation | null> {
  const token = getMapboxToken();
  if (!token) {
    throw new Error("Mapbox access token is missing.");
  }

  const query = buildGeocodeQuery(address);
  if (!query.trim()) return null;

  const url = new URL(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("limit", "1");
  url.searchParams.set("types", "address,place");
  url.searchParams.set("country", address.country || "US");
  if (address.postalCode) {
    url.searchParams.set("proximity", "ip");
  }

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Geocoding failed (${response.status}).`);
  }

  const data = (await response.json()) as MapboxGeocodeResponse;
  const feature = data.features[0];
  if (!feature) return null;

  const [longitude, latitude] = feature.center;
  return {
    longitude,
    latitude,
    label: feature.place_name,
  };
}
