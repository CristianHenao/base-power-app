import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { Badge } from "@/components/ui/badge";
import { UtilityMapExperience } from "@/components/utility-map/utility-map-experience";

export const metadata: Metadata = {
  title: "Utility grid stress",
  description: "Base sales mockup: where Texas utilities need Base (dummy data).",
};

export default function UtilityMapPage() {
  return (
    <div className="app-shell-map">
      <SiteHeader homeHref="/utility-map" overlay>
        <Badge variant="secondary">Base sales</Badge>
      </SiteHeader>
      <div className="absolute inset-0 min-h-0">
        <UtilityMapExperience />
      </div>
    </div>
  );
}
