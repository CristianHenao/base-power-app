import {
  WEATHER_HAZARD_META,
  type WeatherHazard,
  type WeatherHazardKind,
} from "@/lib/risk/synthetic-weather";

export type OutageStatus = "restored" | "active" | "forecast";

export type HomeOutageEvent = {
  id: string;
  /** Linked synthetic weather hazard, or a county weather-event id */
  hazardId: string;
  causeKind: WeatherHazardKind;
  title: string;
  detail: string;
  startedAt: Date;
  endedAt: Date;
  durationHours: number;
  status: OutageStatus;
  /** Whether this outage darkened the homeowner’s block. County history leaves this false. */
  impactedHome: boolean;
  /** Home-block demo, or peak customers out for a county event */
  homesAffected: number;
  /** County history describes homes in the county, not this address. */
  scope?: "home" | "county";
};

export type HomeOutageTimeline = {
  events: HomeOutageEvent[];
  totals: {
    outageCount: number;
    totalHours: number;
    longestHours: number;
    byCause: Record<WeatherHazardKind, number>;
  };
};

function seededUnit(lng: number, lat: number, salt: number): number {
  const x = Math.sin(lng * 12.9898 + lat * 78.233 + salt * 45.164) * 43758.5453;
  return x - Math.floor(x);
}

function hoursBetween(start: Date, end: Date): number {
  return Math.max(0.25, (end.getTime() - start.getTime()) / (1000 * 60 * 60));
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function addDays(date: Date, days: number): Date {
  return addHours(date, days * 24);
}

const OUTAGE_COPY: Record<
  WeatherHazardKind,
  Array<{ title: string; detail: string }>
> = {
  storm: [
    {
      title: "Feeder trip after thunderstorm",
      detail:
        "Lightning and wind brought down a lateral near your block; crew restored service overnight.",
    },
    {
      title: "Momentary outage from wind gusts",
      detail:
        "Gust front caused a recloser to operate twice before locking out a short segment.",
    },
  ],
  snow: [
    {
      title: "Ice-loaded line outage",
      detail:
        "Wet snow and ice snapped an overhead span; heating demand delayed full restoration.",
    },
    {
      title: "Winter storm rolling blackout window",
      detail:
        "Icy conditions and elevated load forced a temporary load-shed on your circuit.",
    },
  ],
  heat: [
    {
      title: "Transformer overload in heat wave",
      detail:
        "Afternoon AC peak stressed a neighborhood transformer serving your street.",
    },
    {
      title: "Heat-related voltage collapse",
      detail:
        "Extreme demand dropped voltage until operators sectionalized the feeder.",
    },
  ],
};

/**
 * Build a home-centric outage timeline from nearby synthetic weather hazards.
 * Events are deterministic for a given home coordinate.
 */
export function generateHomeOutageTimeline(
  home: [number, number],
  hazards: WeatherHazard[],
  now = new Date(),
): HomeOutageTimeline {
  const [lng, lat] = home;
  const relevant = hazards.filter((h) => h.severity >= 2);
  const events: HomeOutageEvent[] = [];

  // Historical outages over the past ~10 months, driven by each hazard.
  relevant.forEach((hazard, index) => {
    const copyOptions = OUTAGE_COPY[hazard.kind];
    const copy =
      copyOptions[Math.floor(seededUnit(lng, lat, 20 + index) * copyOptions.length)]!;

    const daysAgo = 18 + index * 55 + seededUnit(lng, lat, 30 + index) * 40;
    const start = addDays(now, -daysAgo);
    start.setHours(
      14 + Math.floor(seededUnit(lng, lat, 40 + index) * 6),
      Math.floor(seededUnit(lng, lat, 50 + index) * 50),
      0,
      0,
    );

    const durationHours =
      hazard.kind === "heat"
        ? 2.5 + hazard.severity * 1.2 + seededUnit(lng, lat, 60 + index) * 3
        : hazard.kind === "snow"
          ? 6 + hazard.severity * 2 + seededUnit(lng, lat, 60 + index) * 8
          : 1.5 + hazard.severity * 1.5 + seededUnit(lng, lat, 60 + index) * 4;

    const end = addHours(start, durationHours);

    events.push({
      id: `outage-hist-${hazard.id}`,
      hazardId: hazard.id,
      causeKind: hazard.kind,
      title: copy.title,
      detail: copy.detail,
      startedAt: start,
      endedAt: end,
      durationHours: Number(durationHours.toFixed(1)),
      status: "restored",
      impactedHome: true,
      homesAffected: Math.round(
        40 + hazard.severity * 35 + seededUnit(lng, lat, 70 + index) * 120,
      ),
    });

    // Secondary shorter outage for higher-severity storms/heat.
    if (hazard.severity >= 4 && index < 2) {
      const start2 = addDays(now, -(8 + index * 12 + seededUnit(lng, lat, 80 + index) * 10));
      start2.setHours(17, 20, 0, 0);
      const duration2 = 0.8 + seededUnit(lng, lat, 90 + index) * 2.5;
      const impactedHome = seededUnit(lng, lat, 85 + index) > 0.35;
      events.push({
        id: `outage-hist-b-${hazard.id}`,
        hazardId: hazard.id,
        causeKind: hazard.kind,
        title:
          hazard.kind === "heat"
            ? "Peak-hour brownout window"
            : "Secondary storm outage",
        detail:
          hazard.kind === "heat"
            ? "Utility shed non-critical load during the hottest hour to protect the feeder."
            : "A second cell brushed the same corridor before crews finished earlier repairs.",
        startedAt: start2,
        endedAt: addHours(start2, duration2),
        durationHours: Number(duration2.toFixed(1)),
        status: "restored",
        impactedHome,
        homesAffected: Math.round(
          20 + hazard.severity * 15 + seededUnit(lng, lat, 95 + index) * 60,
        ),
      });
    }
  });

  // Forecast outage risk tied to the strongest nearby hazard.
  const forecastHazard =
    [...relevant].sort((a, b) => b.severity - a.severity)[0] ?? null;
  if (forecastHazard) {
    const start = addDays(now, 1 + seededUnit(lng, lat, 100) * 2);
    start.setHours(16, 0, 0, 0);
    const durationHours = 3 + forecastHazard.severity * 1.5;
    events.push({
      id: `outage-forecast-${forecastHazard.id}`,
      hazardId: forecastHazard.id,
      causeKind: forecastHazard.kind,
      title: `Elevated outage risk — ${WEATHER_HAZARD_META[forecastHazard.kind].label.toLowerCase()}`,
      detail: `Based on nearby ${WEATHER_HAZARD_META[forecastHazard.kind].label.toLowerCase()} patterns, your home has a raised chance of losing power if conditions intensify.`,
      startedAt: start,
      endedAt: addHours(start, durationHours),
      durationHours: Number(durationHours.toFixed(1)),
      status: "forecast",
      impactedHome: true,
      homesAffected: Math.round(80 + forecastHazard.severity * 40),
    });
  }

  events.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  // Recalculate durations precisely after sorting.
  for (const event of events) {
    event.durationHours = Number(
      hoursBetween(event.startedAt, event.endedAt).toFixed(1),
    );
  }

  const restored = events.filter((e) => e.status === "restored");
  const byCause: Record<WeatherHazardKind, number> = {
    storm: 0,
    snow: 0,
    heat: 0,
  };
  for (const event of restored) {
    byCause[event.causeKind] += 1;
  }

  const totalHours = restored.reduce((sum, e) => sum + e.durationHours, 0);
  const longestHours = restored.reduce(
    (max, e) => Math.max(max, e.durationHours),
    0,
  );

  return {
    events,
    totals: {
      outageCount: restored.length,
      totalHours: Number(totalHours.toFixed(1)),
      longestHours: Number(longestHours.toFixed(1)),
      byCause,
    },
  };
}

export function formatOutageWhen(date: Date, now = new Date()): string {
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDurationHours(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)} min`;
  }
  if (hours < 24) {
    const whole = Math.floor(hours);
    const mins = Math.round((hours - whole) * 60);
    return mins > 0 ? `${whole}h ${mins}m` : `${whole}h`;
  }
  const days = hours / 24;
  return `${days.toFixed(1)} days`;
}
