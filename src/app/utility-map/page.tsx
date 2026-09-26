import type { Metadata } from "next";
import { Caveat, Hanken_Grotesk, Zilla_Slab } from "next/font/google";
import { SiteHeader } from "@/components/layout/site-header";
import { UtilityMapExperience } from "@/components/utility-map/utility-map-experience";
import { cn } from "@/lib/utils";
import "./base-theme.css";

// Free stand-ins for Base's commercial fonts (see docs/base-power-styleguide.md).
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-bp-sans",
});
const script = Caveat({ subsets: ["latin"], weight: "400", variable: "--font-bp-script" });
const display = Zilla_Slab({ subsets: ["latin"], weight: "700", variable: "--font-bp-display" });

export const metadata: Metadata = {
  title: "Utility grid stress",
  description: "Base sales mockup: where Texas utilities need Base (dummy data).",
};

export default function UtilityMapPage() {
  return (
    <div className={cn("app-shell-map bp-theme", sans.variable, script.variable, display.variable)}>
      {/* The guide's header has no border; drop it on this page only. */}
      <SiteHeader homeHref="/utility-map" overlay className="border-transparent">
        <span className="rounded-full bg-[var(--bp-green-5)] px-3 py-1 text-[12px] leading-[18px] font-semibold text-[var(--bp-green-90)]">
          Base sales
        </span>
      </SiteHeader>
      <div className="absolute inset-0 min-h-0">
        <UtilityMapExperience />
      </div>
    </div>
  );
}
