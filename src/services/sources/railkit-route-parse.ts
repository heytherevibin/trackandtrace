import { messages } from "@/messages";
import type { RouteOutcome, RouteRequest, RouteTrain } from "@/services/route-source";
import { isRecord } from "./irctc-record";
import { unavailable } from "./outcome";

// ---------------------------------------------------------------------------
// The trains-between parser, on the shape measured live on 2026-09-25 from
// GET /api/v1/trains/between/SBC/NDLS.
//
// Fail-closed, like every parser here: a body that is not the measured shape is
// unreadable, never "no trains". Those two are the same sentence to a careless
// reader and opposite answers to a traveller — one means try another pair, the
// other means try again later. An array that really is empty IS an answer and
// comes back as one.
//
// A record without a train number is dropped rather than repaired: a row we
// cannot name is a row we cannot ask availability for.
// ---------------------------------------------------------------------------

const OUT = messages.source.outcomes;

const MASK = /^[01]{7}$/;
const YN_MASK = /^[YN]{7}$/i;

/**
 * The provider's seven-character running-days mask, read as seven flags.
 *
 * WHICH FLAG IS WHICH WEEKDAY IS NOT VERIFIED. The probe that found this
 * endpoint printed field shapes, not values, so the mask's calendar order is
 * unknown and nothing may name a weekday from it until one real response has
 * been read. Seven flags still answer "how many days a week", which needs no
 * calendar. A mask in any other form is null, never a guess.
 */
export function readRunningDays(value: unknown): readonly boolean[] | null {
  if (typeof value !== "string") return null;
  const mask = value.trim();
  if (MASK.test(mask)) return [...mask].map((c) => c === "1");
  if (YN_MASK.test(mask)) return [...mask].map((c) => c.toUpperCase() === "Y");
  return null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** A count the provider sends as either a number or its decimal string. Anything else is absent, not zero. */
function count(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim());
  return value.trim().length > 0 && Number.isFinite(parsed) ? parsed : null;
}

function code(value: unknown, fallback: string): string {
  return text(value)?.toUpperCase() ?? fallback;
}

/** One record, or null when it carries no train number to ask availability with. */
function readTrain(value: unknown, request: RouteRequest): RouteTrain | null {
  if (!isRecord(value)) return null;
  const trainNo = text(value.train_no);
  if (!trainNo) return null;
  const fromCode = code(value.from_stn_code, request.from);
  const toCode = code(value.to_stn_code, request.to);
  const runningDays = text(value.running_days);
  return {
    trainNo,
    trainName: text(value.train_name) ?? trainNo,
    fromCode,
    fromName: text(value.from_stn_name) ?? fromCode,
    toCode,
    toName: text(value.to_stn_name) ?? toCode,
    originCode: code(value.source_stn_code, fromCode),
    originName: text(value.source_stn_name) ?? code(value.source_stn_code, fromCode),
    destinationCode: code(value.dstn_stn_code, toCode),
    destinationName: text(value.dstn_stn_name) ?? code(value.dstn_stn_code, toCode),
    departs: text(value.from_time),
    arrives: text(value.to_time),
    travelTime: text(value.travel_time),
    runningDays,
    runsOn: readRunningDays(runningDays),
    halts: count(value.halts),
    distanceKm: count(value.distance),
  };
}

export function parseRailkitRouteResponse(body: unknown, request: RouteRequest, now: Date): RouteOutcome {
  if (!isRecord(body) || body.success !== true || !Array.isArray(body.data)) return unavailable(OUT.unreadable, "unreadable");
  const trains = body.data.map((entry) => readTrain(entry, request)).filter((train): train is RouteTrain => train !== null);
  return { ok: true, answer: { from: request.from, to: request.to, trains, retrievedAt: now.toISOString() } };
}
