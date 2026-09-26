"use client";

import { Activity, CloudSun, Home, LineChart, Zap } from "lucide-react";
import { FrostPanel } from "@/components/risk/frost-panel";
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

type RiskBottomMenuProps = {
  primaryTab: RiskPrimaryTabId;
  onPrimaryTabChange: (id: RiskPrimaryTabId) => void;
  /** null = browsing options; map stays lit until user picks one */
  activeAnalysisId: RiskAnalysisItemId | null;
  onAnalysisChange: (id: RiskAnalysisItemId) => void;
  className?: string;
};

export function RiskBottomMenu({
  primaryTab,
  onPrimaryTabChange,
  activeAnalysisId,
  onAnalysisChange,
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
                      <span className="text-sm font-medium">{item.label}</span>
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
