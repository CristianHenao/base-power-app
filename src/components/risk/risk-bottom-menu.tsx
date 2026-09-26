"use client";

import { Activity, CloudSun, Home, LineChart, Zap } from "lucide-react";
import { FrostPanel } from "@/components/risk/frost-panel";
import type { WeatherHazardKind } from "@/lib/risk/synthetic-weather";
import { WEATHER_HAZARD_META } from "@/lib/risk/synthetic-weather";
import { cn } from "@/lib/utils";

export const RISK_PRIMARY_TABS = [
  {
    id: "analysis",
    label: "Analysis",
    icon: LineChart,
  },
  {
    id: "home",
    label: "My home",
    icon: Home,
  },
] as const;

export const RISK_ANALYSIS_ITEMS = [
  {
    id: "weather",
    label: "Weather analysis",
    icon: CloudSun,
  },
  {
    id: "grid",
    label: "Grid analysis",
    icon: Zap,
  },
  {
    id: "usage",
    label: "Usage levels",
    icon: Activity,
  },
] as const;

export type RiskPrimaryTabId = (typeof RISK_PRIMARY_TABS)[number]["id"];
export type RiskAnalysisItemId = (typeof RISK_ANALYSIS_ITEMS)[number]["id"];

export type WeatherRiskBadge = {
  kind: WeatherHazardKind;
  label: string;
  color: string;
};

type RiskBottomMenuProps = {
  primaryTab: RiskPrimaryTabId;
  onPrimaryTabChange: (id: RiskPrimaryTabId) => void;
  /** null = browsing options; map stays lit until user picks one */
  activeAnalysisId: RiskAnalysisItemId | null;
  onAnalysisChange: (id: RiskAnalysisItemId) => void;
  /** Property-facing weather risks shown under Weather analysis */
  weatherRiskBadges?: WeatherRiskBadge[];
  className?: string;
};

export function RiskBottomMenu({
  primaryTab,
  onPrimaryTabChange,
  activeAnalysisId,
  onAnalysisChange,
  weatherRiskBadges = [],
  className,
}: RiskBottomMenuProps) {
  const showAnalysisList = primaryTab === "analysis";

  return (
    <div
      className={cn(
        "pointer-events-auto mx-auto flex w-full max-w-md flex-col gap-2",
        className,
      )}
    >
      {showAnalysisList ? (
        <FrostPanel>
          <nav aria-label="Analysis options">
            <ul className="divide-y divide-black/8">
              {RISK_ANALYSIS_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.id === activeAnalysisId;
                const showWeatherBadges =
                  item.id === "weather" && weatherRiskBadges.length > 0;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => onAnalysisChange(item.id)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                        active
                          ? "bg-black/5 text-foreground"
                          : "text-muted-foreground hover:bg-black/[0.03] hover:text-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-xl",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "bg-black/5 text-muted-foreground",
                        )}
                      >
                        <Icon className="size-4.5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          {item.label}
                        </span>
                        {showWeatherBadges ? (
                          <span className="mt-1.5 flex flex-wrap gap-1">
                            {weatherRiskBadges.map((badge) => (
                              <span
                                key={badge.kind}
                                className="inline-flex items-center rounded-md bg-black/[0.06] px-1.5 py-0.5 text-[10px] font-medium leading-none text-foreground/70 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]"
                              >
                                {badge.label}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </FrostPanel>
      ) : null}

      <FrostPanel>
        <nav aria-label="Risk map views" className="p-1.5">
          <ul className="grid grid-cols-2 gap-1">
            {RISK_PRIMARY_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = tab.id === primaryTab;
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => onPrimaryTabChange(tab.id)}
                    className={cn(
                      "flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-black/[0.03] hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4.5" aria-hidden />
                    {tab.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </FrostPanel>
    </div>
  );
}

/** Compact badges from the property’s nearby weather hazards. */
export function weatherRiskBadgesFromHazards(
  hazards: Array<{ kind: WeatherHazardKind; severity: number }>,
): WeatherRiskBadge[] {
  const byKind = new Map<WeatherHazardKind, number>();
  for (const hazard of hazards) {
    const prev = byKind.get(hazard.kind) ?? 0;
    if (hazard.severity > prev) byKind.set(hazard.kind, hazard.severity);
  }

  const order: WeatherHazardKind[] = ["heat", "storm", "snow"];
  return order
    .filter((kind) => byKind.has(kind))
    .map((kind) => ({
      kind,
      label: WEATHER_HAZARD_META[kind].label,
      color: WEATHER_HAZARD_META[kind].color,
    }));
}
