"use client";

import { useState } from "react";
import type { Backup } from "@/lib/report/types";
import { cn } from "@/lib/utils";
import { hours, monthLabel } from "./format";

const WIDTH = 640;
const HEIGHT = 220;
const PAD = { left: 40, right: 8, top: 12, bottom: 26 };
const SERIES = [
  { key: "cores_1", label: "1 Core", className: "fill-[#2a78d6] dark:fill-[#3987e5]" },
  { key: "cores_2", label: "2 Cores", className: "fill-[#eb6834] dark:fill-[#d95926]" },
] as const;

type Mode = "normal" | "surprise";

function niceMax(value: number): number {
  const power = 10 ** Math.floor(Math.log10(Math.max(value, 1)));
  for (const step of [1, 1.5, 2, 2.5, 5, 10]) if (step * power >= value) return step * power;
  return 10 * power;
}

/** Backup hours by month for one and two Cores, from a full battery or from Base's 20% reserve. */
export function BackupChart({ backup }: { backup: Backup }) {
  const [mode, setMode] = useState<Mode>("normal");
  const data = mode === "normal" ? backup.hours_by_month : backup.surprise.hours_by_month;
  const top = niceMax(Math.max(...data.cores_2));
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / 12;
  const barW = Math.min(18, (slot - 6) / 2);
  const y = (v: number) => PAD.top + plotH - (plotH * v) / top;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const shortest = data.cores_1.indexOf(Math.min(...data.cores_1));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-sm text-muted-foreground" aria-label="Legend">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <svg width="10" height="10" aria-hidden="true">
                <rect width="10" height="10" rx="2" className={s.className} />
              </svg>
              {s.label}
            </span>
          ))}
        </div>
        <div className="flex rounded-md border text-sm" role="group" aria-label="Starting charge">
          {(["normal", "surprise"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn("px-3 py-1", mode === m ? "bg-muted font-medium" : "text-muted-foreground")}
            >
              {m === "normal" ? "Storm forecast (starts full)" : "No warning (starts at 20%)"}
            </button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img"
        aria-label={`Backup hours by month. Shortest month for one Core: ${monthLabel(shortest)}, ${hours(data.cores_1[shortest])}.`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
              {Math.round(t)} h
            </text>
          </g>
        ))}
        {data.cores_1.map((_, m) => {
          const x0 = PAD.left + m * slot + (slot - (2 * barW + 2)) / 2;
          return (
            <g key={m}>
              {SERIES.map((s, i) => {
                const value = data[s.key][m];
                const h = Math.max(PAD.top + plotH - y(value), 1);
                return (
                  <rect key={s.key} x={x0 + i * (barW + 2)} y={y(value)} width={barW} height={h} rx={3}
                    className={s.className}>
                    <title>{`${monthLabel(m)}, ${s.label}: ${hours(value)}`}</title>
                  </rect>
                );
              })}
              <text x={PAD.left + m * slot + slot / 2} y={HEIGHT - 8} textAnchor="middle"
                className={cn("text-[10px]", m === shortest ? "fill-foreground font-semibold" : "fill-muted-foreground")}>
                {monthLabel(m)}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="text-sm text-muted-foreground">
        Shortest month on one Core: <span className="font-medium text-foreground">{monthLabel(shortest)}, {hours(data.cores_1[shortest])}</span>.
        Typical home, {backup.assumptions.kwh_per_core} kWh per Core, normal use, {backup.assumptions.profile_year} load profile. Estimates.
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Table view</summary>
        <table className="mt-2 w-full text-left">
          <thead><tr><th className="font-medium">Month</th><th className="font-medium">1 Core</th><th className="font-medium">2 Cores</th></tr></thead>
          <tbody>
            {data.cores_1.map((v, m) => (
              <tr key={m}><td>{monthLabel(m)}</td><td>{hours(v)}</td><td>{hours(data.cores_2[m])}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
