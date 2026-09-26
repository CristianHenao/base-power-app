"use client";

import { Activity, CloudSun, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export const RISK_MENU_ITEMS = [
  {
    id: "weather",
    label: "Weather analysis",
    shortLabel: "Weather",
    icon: CloudSun,
  },
  {
    id: "grid",
    label: "Grid analysis",
    shortLabel: "Grid",
    icon: Zap,
  },
  {
    id: "usage",
    label: "Usage levels",
    shortLabel: "Usage",
    icon: Activity,
  },
] as const;

export type RiskMenuItemId = (typeof RISK_MENU_ITEMS)[number]["id"];

type RiskBottomMenuProps = {
  activeId: RiskMenuItemId;
  onChange: (id: RiskMenuItemId) => void;
  className?: string;
};

export function RiskBottomMenu({
  activeId,
  onChange,
  className,
}: RiskBottomMenuProps) {
  return (
    <nav
      aria-label="Risk analysis tools"
      className={cn(
        "pointer-events-auto mx-auto w-full max-w-md rounded-2xl border border-border/60 bg-background/90 p-1.5 shadow-lg backdrop-blur-md",
        className,
      )}
    >
      <ul className="grid grid-cols-3 gap-1">
        {RISK_MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <button
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => onChange(item.id)}
                className={cn(
                  "flex w-full flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-center transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span className="text-[11px] font-medium leading-tight sm:text-xs">
                  <span className="sm:hidden">{item.shortLabel}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
