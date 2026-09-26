import { messages } from "@/messages";
import type { TrainRouteAnswer, TrainStop } from "@/services/train-route-source";
import { isRecord, text, type Json } from "./irctc-record";
import { unavailable, type SourceFailure } from "./outcome";

// ---------------------------------------------------------------------------
// Reads RailKit's train-info answer (GET /api/v1/trains/:trainNo/info) into the
// train-route seam. Pure: no I/O, no clock beyond the `now` passed in.
//
// Shape measured live 2026-09-26 on 12601 MAS–MAQ, 31 stops:
//
//   { trainInfo: { train_no, train_name, … },
//     route: [ { stnCode, stnName, arrival, departure, halt, haltMinutes,
//                distance, day, platform, coordinates } ] }
//
// Two things that shape teaches, both pinned by tests:
//
//   * `arrival` is "--" at the origin and `departure` is "--" at the terminus.
//     They become NULL, never 0 and never "00:00" — a terminus that read 00:00
//     would be a departure in the middle of the night, printed as a fact.
//   * `distance` and `day` arrive as STRINGS ("0", "889", "1"). They are numbers
//     here, and a value that will not parse is null rather than zero, because
//     "0 km" at the last stop would say the train went nowhere.
//
// An empty stop list is UNREADABLE, not a train with no stops. Every train calls
// somewhere, so the empty list can only mean the record was not understood.
// ---------------------------------------------------------------------------

const OUT = messages.source.outcomes;

/** "--", "", and whitespace all mean "no time here". */
function time(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || /^-+$/.test(trimmed)) return null;
  return trimmed;
}

/** A non-negative integer from a number or a numeric string; null for anything else. */
function count(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function stopOf(value: Json): TrainStop | null {
  if (!isRecord(value)) return null;
  const code = text(value, ["stnCode", "stationCode", "station_code"])?.toUpperCase();
  // A stop with no code cannot be drawn, matched to the traveller's boarding point, or linked.
  if (!code) return null;
  return {
    code,
    name: text(value, ["stnName", "stationName", "station_name"]) ?? code,
    arrival: time(value.arrival),
    departure: time(value.departure),
    haltMinutes: count(value.haltMinutes),
    distanceKm: count(value.distance),
    day: count(value.day),
    // Platforms are renumbered and reassigned; 0 is the provider's "unknown", not platform zero.
    platform: ((p) => (p === null || p === 0 ? null : p))(count(value.platform)),
  };
}

export function parseRailkitTrainRouteResponse(body: unknown, trainNo: string, now: Date): { ok: true; answer: TrainRouteAnswer } | SourceFailure {
  if (!isRecord(body)) return unavailable(OUT.unreadable, "unreadable");
  const data = isRecord(body.data) ? body.data : body;
  const info = isRecord(data.trainInfo) ? data.trainInfo : {};
  const rows = Array.isArray(data.route) ? data.route : Array.isArray(data.stations) ? data.stations : null;
  if (!rows) return unavailable(OUT.unreadable, "unreadable");

  const stops = rows.map(stopOf).filter((stop): stop is TrainStop => stop !== null);
  // Every train calls somewhere. An empty list is a record this could not read, and must not be
  // drawn as a run with no stations.
  if (stops.length === 0) return unavailable(OUT.unreadable, "unreadable");

  const echoed = text(info, ["train_no", "trainNo"]);
  // An echo that DISAGREES is an answer to a question we did not ask; an absent one is no reason
  // to refuse a timetable. Same rule the PNR and availability parsers follow.
  if (echoed !== undefined && echoed.trim() !== trainNo.trim()) return unavailable(OUT.unreadable, "unreadable");

  return {
    ok: true,
    answer: {
      trainNo: echoed?.trim() ?? trainNo,
      trainName: text(info, ["train_name", "trainName"]) ?? "",
      stops,
      retrievedAt: now.toISOString(),
    },
  };
}
