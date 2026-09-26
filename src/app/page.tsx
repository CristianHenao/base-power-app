import { MapViewClient } from "@/components/map/map-view-client";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col gap-6">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Project scaffold</h1>
          <Badge variant="outline">bones</Badge>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Next.js PWA with shadcn/ui, Mapbox GL, and a Three.js custom-layer hook.
          Screens come next — this page verifies the foundation.
        </p>
      </section>

      <MapViewClient className="min-h-[28rem] w-full flex-1" />

      <section className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Next.js + PWA</CardTitle>
            <CardDescription>
              App Router, Serwist service worker, installable manifest.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Offline fallback at <code>/~offline</code>.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">shadcn/ui</CardTitle>
            <CardDescription>
              Button, Card, Sheet, Badge, Skeleton, Separator ready to extend.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Add more with <code>npx shadcn@latest add …</code>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mapbox + Three.js</CardTitle>
            <CardDescription>
              Map canvas with a 3D custom layer scaffold for overlays.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Token via <code>NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code>.
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
