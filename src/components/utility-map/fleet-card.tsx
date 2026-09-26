"use client";

import type { FleetScenario } from "@/lib/utility-map/fleet";
import type { UtilityMapData, UtilityRecord } from "@/lib/utility-map/types";

export const FLEET_SHARES = [0.01, 0.05, 0.1] as const;
export type FleetShare = (typeof FLEET_SHARES)[number];

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

function mw(value: number): string {
  return value >= 100 ? whole.format(value) : oneDecimal.format(value);
}

/** Summer peak as a bar with the fleet's two-hour MW as a lime segment. */
export function FleetBar({ fleet, peakMw, estimated }: { fleet: FleetScenario; peakMw: number | null; estimated: boolean }) {
  if (peakMw == null || fleet.peakShare == null) {
    return (
      <p className="text-[14px] leading-[21px] text-white/85">
        {mw(fleet.dispatchMw2h)} MW for 2 hours. This utility&apos;s peak demand isn&apos;t published, so no share
        of peak is shown.
      </p>
    );
  }
  const width = Math.max(fleet.peakShare * 100, 0.6);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 text-[12px] leading-[18px] text-white/85">
        <span>Summer peak {whole.format(peakMw)} MW{estimated ? " (estimated)" : ""}</span>
        <span>2024</span>
      </div>
      <div
        className="h-3 overflow-hidden rounded-full bg-white/15"
        role="img"
        aria-label={`A Base fleet could supply ${percent.format(fleet.peakShare)} of summer peak for two hours`}
      >
        <div
          className="h-full rounded-full bg-[var(--bp-green-20)] transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${Math.min(width, 100)}%` }}
        />
      </div>
      <p className="text-[20px] leading-[27px] font-semibold text-[var(--bp-green-20)] tabular-nums">
        {mw(fleet.dispatchMw2h)} MW · {percent.format(fleet.peakShare)} of peak
      </p>
    </div>
  );
}

export function FleetCard({
  data,
  utility,
  fleet,
  share,
  onShare,
  spikeHours,
}: {
  data: UtilityMapData;
  utility: UtilityRecord;
  fleet: FleetScenario;
  share: FleetShare;
  onShare: (share: FleetShare) => void;
  spikeHours: number | null;
}) {
  const stats = utility.grid_stats;
  return (
    <div className="bp-dark space-y-4 p-5">
      <div className="space-y-1">
        <p className="text-[20px] leading-[27px] font-semibold">What if Base were here</p>
        <p className="text-[14px] leading-[21px] text-white/85">
          One Core in this share of owner-occupied single-family homes. Estimates.
        </p>
      </div>
      <div className="flex gap-2" role="group" aria-label="Fleet size">
        {FLEET_SHARES.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={share === value}
            onClick={() => onShare(value)}
            className="bp-pill flex-1"
          >
            {Math.round(value * 100)}%
          </button>
        ))}
      </div>
      <FleetBar
        fleet={fleet}
        peakMw={stats?.summer_peak_mw ?? null}
        estimated={stats?.peak_source === "ercot_zone_estimate"}
      />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label="Cores" value={whole.format(fleet.cores)} />
        <Stat label="Energy stored" value={`${mw(fleet.storageMwh)} MWh`} />
        <Stat label="Nameplate, up to" value={`${mw(fleet.nameplateMw)} MW`} />
        {fleet.backupCustomerHours != null ? (
          <Stat label="Backup in long outages" value={`${whole.format(fleet.backupCustomerHours)} customer-h / yr`} />
        ) : null}
        {spikeHours != null ? (
          <Stat
            label="Per price spike"
            value={`${mw(fleet.spikeMwh)} MWh`}
            note={`${whole.format(spikeHours)} spike hours / yr in its zone`}
          />
        ) : null}
      </dl>
      <p className="text-[12px] leading-[18px] text-white/75">
        Idealized ceiling: full charge, {Math.round(data.battery.reserve_fraction * 100)}% kept for backup,{" "}
        {data.battery.dispatch_window_h}-hour window, {data.battery.kwh_per_core} kWh and {data.battery.kw_per_core} kW
        per Core. Backup assumes about {data.battery.backup_hours_assumed} h per Core. Not a dispatch commitment. For
        scale: Base serves 30,000+ homes today.
      </p>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-[12px] leading-[18px] font-medium text-white/85">{label}</dt>
      <dd className="text-[18px] leading-[24px] font-semibold text-[var(--bp-green-20)] tabular-nums">{value}</dd>
      {note ? <dd className="text-[12px] leading-[18px] text-white/75">{note}</dd> : null}
    </div>
  );
}

export function GridCard({ utility }: { utility: UtilityRecord }) {
  const stats = utility.grid_stats;
  if (!stats) return null;
  const gwh = (mwh: number | null) => (mwh == null ? "—" : `${whole.format(mwh / 1000)} GWh`);
  return (
    <div className="space-y-2">
      <p className="text-[16px] leading-[24px] font-semibold">Grid</p>
      <dl className="bp-row-list grid grid-cols-2 text-[14px] leading-[21px]">
        <div className="border-b border-r p-3">
          <dt className="text-[12px] leading-[18px] text-muted-foreground">Summer peak</dt>
          <dd className="font-semibold tabular-nums">
            {stats.summer_peak_mw == null ? "—" : `${whole.format(stats.summer_peak_mw)} MW`}
          </dd>
        </div>
        <div className="border-b p-3">
          <dt className="text-[12px] leading-[18px] text-muted-foreground">Winter peak</dt>
          <dd className="font-semibold tabular-nums">
            {stats.winter_peak_mw == null ? "—" : `${whole.format(stats.winter_peak_mw)} MW`}
          </dd>
        </div>
        <div className="border-r p-3">
          <dt className="text-[12px] leading-[18px] text-muted-foreground">Energy delivered</dt>
          <dd className="font-semibold tabular-nums">{gwh(stats.sales_mwh)}</dd>
        </div>
        <div className="p-3">
          <dt className="text-[12px] leading-[18px] text-muted-foreground">To homes</dt>
          <dd className="font-semibold tabular-nums">{gwh(stats.residential_mwh)}</dd>
        </div>
      </dl>
      <p className="text-[12px] leading-[18px] text-muted-foreground">
        EIA-861, 2024.{" "}
        {stats.peak_source === "ercot_zone_estimate"
          ? "Peak not reported to EIA; estimated from ERCOT weather-zone load and this utility's share of customers."
          : "Peaks as reported to EIA."}
      </p>
    </div>
  );
}
