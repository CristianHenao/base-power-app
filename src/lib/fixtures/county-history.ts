/** Synthetic Harris County history for the weather outage cards.
 * County outage events plus county storm context. No address polygons.
 */
import type { CountyOutageEvent, WeatherEvent } from "@/lib/types/risk-data";
import type { HomeOutageEvent } from "@/lib/risk/synthetic-outages";
import type { WeatherHazardKind } from "@/lib/risk/synthetic-weather";

const countyFips = "48201";
const countyName = "Harris";

const winterWindow = { start: "2021-02-15T06:00:00Z", end: "2021-02-17T18:00:00Z" };
const hurricaneWindow = { start: "2024-07-08T12:00:00Z", end: "2024-07-10T00:00:00Z" };
const heatWindow = { start: "2023-08-14T16:00:00Z", end: "2023-08-15T02:00:00Z" };

export const harrisCountyWeather: WeatherEvent[] = [
  {
    id: "harris-winter-2021",
    name: "February 2021 winter storm",
    hazards: ["winter_weather"],
    window: winterWindow,
    kind: "observed_event",
    homeRelation: "county_context",
    footprint: null,
    layerId: null,
    evidence: [{
      sourceId: "noaa_storm_events",
      datasetVersion: "synthetic-county-history-v1",
      sourceRecordId: "demo-harris-winter-2021",
      retrievedAt: "2026-09-26T12:00:00Z",
      spatialScope: "county",
      resolutionMeters: null,
      method: "County storm-event record. No warning polygon.",
      qualityFlags: ["synthetic_example"],
    }],
  },
  {
    id: "harris-beryl-2024",
    name: "July 2024 hurricane",
    hazards: ["hurricane", "wind"],
    window: hurricaneWindow,
    kind: "observed_event",
    homeRelation: "county_context",
    footprint: null,
    layerId: null,
    evidence: [{
      sourceId: "noaa_storm_events",
      datasetVersion: "synthetic-county-history-v1",
      sourceRecordId: "demo-harris-beryl-2024",
      retrievedAt: "2026-09-26T12:00:00Z",
      spatialScope: "county",
      resolutionMeters: null,
      method: "County storm-event record. No warning polygon.",
      qualityFlags: ["synthetic_example"],
    }],
  },
  {
    id: "harris-heat-2023",
    name: "August 2023 heat",
    hazards: ["heat"],
    window: heatWindow,
    kind: "observed_event",
    homeRelation: "county_context",
    footprint: null,
    layerId: null,
    evidence: [{
      sourceId: "noaa_storm_events",
      datasetVersion: "synthetic-county-history-v1",
      sourceRecordId: "demo-harris-heat-2023",
      retrievedAt: "2026-09-26T12:00:00Z",
      spatialScope: "county",
      resolutionMeters: null,
      method: "County storm-event record. No warning polygon.",
      qualityFlags: ["synthetic_example"],
    }],
  },
];

export const harrisCountyOutages: CountyOutageEvent[] = [
  {
    id: "48201-2021-02-15",
    countyFips,
    window: winterWindow,
    peakCustomersOut: 410_000,
    customerHoursInterrupted: 6_200_000,
    observedIntervals: 240,
    expectedIntervals: 240,
    weatherLinks: [{
      weatherEventId: "harris-winter-2021",
      relationship: "space_time_overlap",
      method: "Same county and overlapping window. Association only.",
    }],
    evidence: [{
      sourceId: "eaglei",
      datasetVersion: "synthetic-county-history-v1",
      sourceRecordId: "demo-48201-2021-02-15",
      retrievedAt: "2026-09-26T12:00:00Z",
      spatialScope: "county",
      resolutionMeters: null,
      method: "Synthetic county event. The window is not every home's outage duration.",
      qualityFlags: ["synthetic_example"],
    }],
  },
  {
    id: "48201-2023-08-14",
    countyFips,
    window: heatWindow,
    peakCustomersOut: 45_000,
    customerHoursInterrupted: 180_000,
    observedIntervals: 40,
    expectedIntervals: 40,
    weatherLinks: [{
      weatherEventId: "harris-heat-2023",
      relationship: "space_time_overlap",
      method: "Same county and overlapping window. Association only.",
    }],
    evidence: [{
      sourceId: "eaglei",
      datasetVersion: "synthetic-county-history-v1",
      sourceRecordId: "demo-48201-2023-08-14",
      retrievedAt: "2026-09-26T12:00:00Z",
      spatialScope: "county",
      resolutionMeters: null,
      method: "Synthetic county event. The window is not every home's outage duration.",
      qualityFlags: ["synthetic_example"],
    }],
  },
  {
    id: "48201-2024-07-08",
    countyFips,
    window: hurricaneWindow,
    peakCustomersOut: 280_000,
    customerHoursInterrupted: 3_100_000,
    observedIntervals: 144,
    expectedIntervals: 144,
    weatherLinks: [{
      weatherEventId: "harris-beryl-2024",
      relationship: "space_time_overlap",
      method: "Same county and overlapping window. Association only.",
    }],
    evidence: [{
      sourceId: "eaglei",
      datasetVersion: "synthetic-county-history-v1",
      sourceRecordId: "demo-48201-2024-07-08",
      retrievedAt: "2026-09-26T12:00:00Z",
      spatialScope: "county",
      resolutionMeters: null,
      method: "Synthetic county event. The window is not every home's outage duration.",
      qualityFlags: ["synthetic_example"],
    }],
  },
];

const causeByHazard: Record<WeatherEvent["hazards"][number], WeatherHazardKind> = {
  flood: "storm",
  storm_surge: "storm",
  hurricane: "storm",
  wind: "storm",
  tornado: "storm",
  hail: "storm",
  winter_weather: "snow",
  ice: "snow",
  heat: "heat",
  wildfire: "heat",
};

function causeKind(event: WeatherEvent): WeatherHazardKind {
  const hazard = event.hazards[0];
  if (!hazard) return "storm";
  return causeByHazard[hazard];
}

function hoursBetween(start: string, end: string): number {
  const hours = (Date.parse(end) - Date.parse(start)) / (1000 * 60 * 60);
  return Number(hours.toFixed(1));
}

/** Card events for the historical slider. Does not claim this address lost power. */
export function countyHistoryToSliderEvents(
  outages: CountyOutageEvent[] = harrisCountyOutages,
  weather: WeatherEvent[] = harrisCountyWeather,
): HomeOutageEvent[] {
  const weatherById = new Map(weather.map((event) => [event.id, event]));

  return [...outages]
    .sort((a, b) => Date.parse(a.window.start) - Date.parse(b.window.start))
    .map((outage) => {
      const linked = weatherById.get(outage.weatherLinks[0]?.weatherEventId ?? "");
      const name = linked?.name ?? `${countyName} County outage`;
      return {
        id: outage.id,
        hazardId: linked?.id ?? outage.id,
        causeKind: linked ? causeKind(linked) : "storm",
        title: name,
        detail: `${countyName} County. Event window for homes in the county, not this address.`,
        startedAt: new Date(outage.window.start),
        endedAt: new Date(outage.window.end),
        durationHours: hoursBetween(outage.window.start, outage.window.end),
        status: "restored",
        impactedHome: false,
        homesAffected: outage.peakCustomersOut,
        scope: "county",
      };
    });
}
