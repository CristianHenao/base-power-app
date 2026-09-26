"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const MapViewLazy = dynamic(
  () => import("@/components/map/map-view").then((m) => m.MapView),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-xl" />,
  },
);

export function MapViewClient(props: ComponentProps<typeof MapViewLazy>) {
  return <MapViewLazy {...props} />;
}
