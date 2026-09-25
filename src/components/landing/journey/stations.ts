import { messages } from "@/messages";

// The landing, drawn as a route (spec 2026-09-24 §3.A): every section a station with its code and kilometre
// post, in page order. GA, the drawn train, joins with its section in J4.

export type StationId = keyof typeof messages.journey.stations;

export interface Station {
  readonly id: StationId;
  readonly code: string;
  readonly km: number;
  readonly name: string;
}

const ROUTE: readonly { readonly id: StationId; readonly code: string; readonly km: number }[] = [
  { id: "top", code: "DEP", km: 0 },
  { id: "principles", code: "01", km: 64 },
  { id: "how", code: "02", km: 138 },
  { id: "record", code: "03", km: 212 },
  { id: "reliability", code: "04", km: 318 },
  { id: "roadmap", code: "05", km: 407 },
  { id: "features", code: "06", km: 530 },
  { id: "use", code: "07", km: 644 },
  { id: "faq", code: "08", km: 730 },
  { id: "terminus", code: "END", km: 781 },
];

export const STATIONS: readonly Station[] = ROUTE.map((stop) => ({ ...stop, name: messages.journey.stations[stop.id] }));

/** Where a stop sits along the strip's track, as a percentage. */
export function stopLeft(index: number, count: number): string {
  return `${((index / (count - 1)) * 100).toFixed(3)}%`;
}

/** Kilometres as the board prints them: three figures. */
export function kmFigure(km: number): string {
  return String(km).padStart(3, "0");
}

/** A stop's accessible name: "01 · Operating principles" for numbered stops, the name alone for DEP and END. */
export function stopName(station: Station): string {
  return /^\d/.test(station.code) ? messages.journey.strip.stop(station.code, station.name) : station.name;
}
