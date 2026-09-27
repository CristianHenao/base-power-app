import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The utility map chat reads the published release from disk on the server.
  outputFileTracingIncludes: {
    "/api/utility-map/chat": [
      "./public/utility-map/current.json",
      "./public/utility-map/releases/*/utility-map.json",
      "./public/utility-map/releases/*/hazards/storms.json",
    ],
  },
  outputFileTracingExcludes: {
    "/api/utility-map/chat": ["./public/utility-map/**/*.geojson"],
  },
};

export default withSerwist(nextConfig);
