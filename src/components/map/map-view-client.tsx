"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function MapLoadingFallback({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn("h-full min-h-[22rem] w-full rounded-xl", className)}
    />
  );
}

const MapViewLazy = dynamic(
  () => import("@/components/map/map-view").then((m) => m.MapView),
  {
    ssr: false,
    loading: () => <MapLoadingFallback />,
  },
);

export function MapViewClient(props: ComponentProps<typeof MapViewLazy>) {
  return <MapViewLazy {...props} />;
}
