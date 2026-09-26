"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APPLIANCES, type LoadItem } from "@/lib/report/core-runtime";
import { type CoresAnswer, householdAnswer } from "@/lib/report/household-answer";
import { scannedLoadItems, useScannedDevices } from "@/lib/report/use-scanned-devices";
import type { HouseholdGap } from "@/lib/report/types";
import { cn } from "@/lib/utils";

const GROUPS: Array<[string, string]> = [
  ["essentials", "Essentials"],
  ["heating_cooling", "Heating and cooling"],
  ["kitchen", "Kitchen"],
  ["water_laundry", "Water and laundry"],
  ["pumps_other", "Other"],
];

type Choice = { on: boolean; priority: boolean };

function hoursText(hours: number): string {
  if (hours < 0.05) return "under 5 minutes";
  if (hours < 1) return `about ${Math.round(hours * 60)} minutes`;
  return `about ${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hours`;
}

function chanceText(chance: number): string {
  if (chance < 0.005) return "under 1%";
  return `${Math.round(chance * 100)}%`;
}

function AnswerRow({ label, answer }: { label: string; answer: Record<1 | 2, CoresAnswer> }) {
  return (
    <tr className="border-t">
      <th scope="row" className="py-2 pr-3 text-left font-medium">{label}</th>
      {([1, 2] as const).map((n) => (
        <td key={n} className="py-2 pr-3">
          {answer[n].overLimit ? (
            <span className="text-destructive">Over the power limit in some months</span>
          ) : (
            <>
              <span className="font-medium">{hoursText(answer[n].full.darkHours)}</span>
              <span className="block text-xs text-muted-foreground">
                {chanceText(answer[n].full.chance)} chance a year · no warning: {hoursText(answer[n].reserve.darkHours)}
              </span>
            </>
          )}
        </td>
      ))}
    </tr>
  );
}

/** A Texas home runs AC in summer and its own kind of heat in winter; start there, then let people edit. */
function startsOn(id: string, defaultOn: boolean, electricHeat: boolean): boolean {
  if (id === "central_ac") return true;
  if (id === "heat_pump_heating") return electricHeat;
  if (id === "furnace_blower") return !electricHeat;
  return defaultOn;
}

/** Expected dark hours a year for a typical home here, then for the appliances the homeowner picks. */
export function HouseholdGapCard({ gap, county, electricHeat }: { gap: HouseholdGap; county: string; electricHeat: boolean }) {
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(APPLIANCES.filter((a) => a.id !== "standby")
      .map((a) => [a.id, { on: startsOn(a.id, a.default_on, electricHeat), priority: a.id === "refrigerator" }])));
  const items: LoadItem[] = useMemo(() => Object.entries(choices)
    .filter(([, c]) => c.on).map(([id, c]) => ({ applianceId: id, priority: c.priority })), [choices]);
  const answer = useMemo(() => householdAnswer(gap, items), [gap, items]);
  const devices = useScannedDevices();
  const scanned = useMemo(() => (devices.length ? householdAnswer(gap, scannedLoadItems(devices)) : null),
    [gap, devices]);
  const typical = gap.typical_home;
  const [lo, hi] = typical.interval_scale;
  const toggle = (id: string, key: keyof Choice) =>
    setChoices((c) => ({ ...c, [id]: { ...c[id], [key]: !c[id][key], ...(key === "priority" && !c[id].priority ? { on: true } : {}) } }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your backup gap</CardTitle>
        <CardDescription>Expected hours a year without power, from {county} County&rsquo;s outage history and how long each kind of storm keeps homes dark</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <div className="grid grid-cols-3 gap-3 text-center">
          {([["No backup", typical.dark_hours.none], ["One Core", typical.dark_hours.one_core],
            ["Two Cores", typical.dark_hours.two_cores]] as const).map(([label, value]) => (
            <div key={label} className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="mt-1 text-lg font-semibold">{value < 0.05 ? "<0.1" : value.toFixed(1)} h</div>
              <div className="text-xs text-muted-foreground">a year</div>
            </div>
          ))}
        </div>
        <p className="text-muted-foreground">
          Typical home here. With no backup, the range is about {(typical.dark_hours.none * lo).toFixed(1)}-
          {(typical.dark_hours.none * hi).toFixed(1)} hours a year. Chance a year brings an outage longer than one Core
          lasts: {chanceText(typical.gap_chance.one_core)}; two Cores: {chanceText(typical.gap_chance.two_cores)}. Estimates.
        </p>

        <details className="rounded-lg border p-3" open>
          <summary className="cursor-pointer font-medium">Answer for my appliances</summary>
          <p className="mt-2 text-xs text-muted-foreground">
            Pick what you would run in an outage. Star what must stay on, like medical devices. This is computed on your device and not sent anywhere.
          </p>
          <div className="mt-3 space-y-3">
            {GROUPS.map(([group, label]) => (
              <fieldset key={group}>
                <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</legend>
                <ul className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {APPLIANCES.filter((a) => a.group === group).map((a) => (
                    <li key={a.id} className="flex items-center gap-2">
                      <input type="checkbox" id={`appl-${a.id}`} checked={choices[a.id]?.on ?? false} onChange={() => toggle(a.id, "on")} />
                      <label htmlFor={`appl-${a.id}`} className="flex-1">{a.name}</label>
                      <button type="button" onClick={() => toggle(a.id, "priority")} aria-pressed={choices[a.id]?.priority ?? false}
                        aria-label={`Must stay on: ${a.name}`}
                        className={cn("px-1 text-base leading-none", choices[a.id]?.priority ? "text-amber-500" : "text-muted-foreground/40")}>
                        ★
                      </button>
                    </li>
                  ))}
                </ul>
              </fieldset>
            ))}
          </div>
          <table className="mt-4 w-full">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1 font-normal">Dark hours a year</th><th className="py-1 font-normal">One Core</th><th className="py-1 font-normal">Two Cores</th>
              </tr>
            </thead>
            <tbody>
              <AnswerRow label="Everything checked" answer={answer.cores} />
              {answer.priority && <AnswerRow label="Starred only" answer={answer.priority} />}
              {scanned && <AnswerRow label={`Your ${devices.length} scanned devices`} answer={scanned.cores} />}
              {scanned?.priority && <AnswerRow label="Scanned priority devices" answer={scanned.priority} />}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            With no backup: {hoursText(answer.none.darkHours)} a year. Heating and cooling count only in their season. Estimates.
          </p>
        </details>
      </CardContent>
    </Card>
  );
}
