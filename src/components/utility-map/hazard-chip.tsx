"use client";

import { CloudHail, Snowflake, ThermometerSun, Tornado, Waves, type LucideIcon } from "lucide-react";
import { HAZARDS, type HazardId } from "@/lib/utility-map/hazard-style";
import { cn } from "@/lib/utils";

/** lucide has no hurricane glyph; a simple spiral. */
export function HurricaneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 4.5c-4.5 0-7.5 3-7.5 6.5" />
      <path d="M12 19.5c4.5 0 7.5-3 7.5-6.5" />
      <path d="M5.5 16.5c1.5 2 3.8 3 6.5 3" />
      <path d="M18.5 7.5c-1.5-2-3.8-3-6.5-3" />
    </svg>
  );
}

const ICONS: Record<string, LucideIcon> = { Waves, CloudHail, Tornado, ThermometerSun, Snowflake };

export function HazardIcon({ hazard, className }: { hazard: HazardId; className?: string }) {
  const name = HAZARDS[hazard].icon;
  if (name === "hurricane") return <HurricaneIcon className={className} />;
  const Icon = ICONS[name];
  return <Icon className={className} aria-hidden />;
}

/** Hazard color never appears without its icon and label (PRD v3 §12.5). */
export function HazardChip({
  hazard,
  pressed,
  onClick,
  className,
}: {
  hazard: HazardId;
  pressed?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const style = HAZARDS[hazard];
  const body = (
    <>
      <span className="flex size-5 items-center justify-center rounded-full text-white" style={{ backgroundColor: style.color }}>
        <HazardIcon hazard={hazard} className="size-3.5" />
      </span>
      {style.label}
    </>
  );
  if (!onClick) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-[12px] leading-[18px] font-semibold", className)}>{body}</span>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn("bp-pill inline-flex items-center gap-1.5 !py-1 !pl-1.5", className)}
    >
      {body}
    </button>
  );
}

export function HazardPicker({
  available,
  picked,
  onToggle,
}: {
  available: HazardId[];
  picked: HazardId[];
  onToggle: (hazard: HazardId) => void;
}) {
  const hint =
    picked.length === 0
      ? "Pick a hazard to see where it happened."
      : picked.length === 1
        ? "Pick a second hazard to see where both run high."
        : picked.length === 2
          ? "Counties colored by both hazards at once (3 × 3)."
          : "Counties colored by how many picked hazards are in Texas's top fifth.";
  return (
    <div className="space-y-2">
      <p className="text-[12px] leading-[18px] font-semibold text-muted-foreground">Hazards</p>
      <div className="flex flex-wrap gap-2">
        {available.map((hazard) => (
          <HazardChip key={hazard} hazard={hazard} pressed={picked.includes(hazard)} onClick={() => onToggle(hazard)} />
        ))}
      </div>
      <p className="text-[12px] leading-[18px] text-muted-foreground">{hint}</p>
    </div>
  );
}
