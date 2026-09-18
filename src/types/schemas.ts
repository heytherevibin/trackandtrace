import { z } from "zod";
import type { HistoryPoint, PnrResult, WatchlistEntry } from "./domain";

// ---------------------------------------------------------------------------
// Canonical wire contract. Every route handler, client fetch, stored record,
// and test validates against these schemas. `Equals` assertions keep the
// hand-written domain interfaces in lockstep with the runtime schemas.
// ---------------------------------------------------------------------------

const PNR_PATTERN = /^\d{10}$/;

export const quotaSchema = z.enum(["GN", "TQ", "PT", "LD", "SS", "HP", "DF", "DP", "FT", "YU", "PH", "RS", "CK", "RC", "OS", "PQWL", "RLWL", "TQWL", "RSWL", "RQWL", "CKWL"]);
export const bookingClassSchema = z.enum(["1A", "2A", "3A", "3E", "SL", "CC", "EC", "EA", "EV", "FC", "2S", "VS"]);
export const ticketStatusSchema = z.enum(["CNF", "RAC", "WL", "CANCELLED", "NOT_FOUND"]);
export const pnrSourceSchema = z.enum(["live", "fixture", "rapidapi"]);
export const confidenceSchema = z.enum(["high", "medium", "low"]);
export const recommendationSchema = z.enum([
  "Confirmed",
  "Likely to confirm",
  "Watch — improving",
  "Watch — risky",
  "High risk",
]);

export const stationSchema = z.object({
  code: z.string().min(2).max(5),
  city: z.string().min(1).optional(),
  state: z.string().optional(),
});

export const trainProfileSchema = z.object({
  number: z.string().regex(/^\d{5}$/),
  name: z.string().min(1).optional(),
  from: stationSchema,
  to: stationSchema,
  depTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  durationHours: z.number().nonnegative().optional(),
  distanceKm: z.number().nonnegative().optional(),
  runsOn: z.number().int().optional(),
});

export const passengerSeatSchema = z.object({
  index: z.number().int().positive(),
  name: z.string().optional(),
  bookingStatus: ticketStatusSchema,
  currentStatus: ticketStatusSchema,
  position: z.number().int().optional(),
  coach: z.string().optional(),
  berth: z.string().optional(),
  quota: quotaSchema,
});

export const historyPointSchema = z.object({
  at: z.iso.datetime(),
  status: ticketStatusSchema,
  position: z.number().int().nullable(),
  probability: z.number().optional(),
});

export const trendDaySchema = z.object({
  date: z.string(),
  dayLabel: z.string(),
  confirmed: z.number(),
  total: z.number(),
});

export const factorSchema = z.object({
  id: z.string(),
  label: z.string(),
  points: z.number(),
  note: z.string(),
  kind: z.enum(["positive", "negative", "neutral"]),
});

export const predictionSchema = z.object({
  probability: z.number(),
  confidence: confidenceSchema,
  recommendation: recommendationSchema,
  note: z.string(),
  factors: z.array(factorSchema),
});

export const pnrSnapshotSchema = z.object({
  pnr: z.string().regex(PNR_PATTERN),
  train: trainProfileSchema,
  cls: bookingClassSchema,
  journeyDate: z.iso.date(),
  journeyDateLabel: z.string(),
  chartTime: z.string().optional(),
  chartAt: z.iso.datetime().optional(),
  chartPrepared: z.boolean().optional(),
  passengerCount: z.number().int().positive(),
  pax: z.array(passengerSeatSchema).min(1),
  source: pnrSourceSchema,
});

export const pnrLeadSchema = z.object({
  status: ticketStatusSchema,
  position: z.number().int().nullable(),
  coach: z.string().optional(),
  berth: z.string().optional(),
  quota: quotaSchema,
});

export const pnrResultSchema = z.object({
  snapshot: pnrSnapshotSchema,
  prediction: predictionSchema.optional(),
  lead: pnrLeadSchema,
  trend: z.array(trendDaySchema).optional(),
  hoursToChart: z.number().optional(),
  checkedAt: z.iso.datetime(),
});

export const errorCodeSchema = z.enum([
  "INVALID_INPUT",
  "NOT_FOUND",
  "RATE_LIMITED",
  "UNAUTHENTICATED",
  "SOURCE_UNAVAILABLE",
  "INTERNAL",
]);

export const apiErrorSchema = z.object({
  ok: z.literal(false),
  code: errorCodeSchema,
  message: z.string(),
  retryAfter: z.number().optional(),
});

export const pnrApiOkSchema = z.object({
  ok: z.literal(true),
  source: pnrSourceSchema,
  cached: z.boolean(),
  latencyMs: z.number().int().nonnegative(),
  rate: z.object({ remaining: z.number().int(), limit: z.number().int() }),
  data: pnrResultSchema,
});

export const pnrApiResponseSchema = z.discriminatedUnion("ok", [pnrApiOkSchema, apiErrorSchema]);

export const watchlistEntrySchema = z.object({
  pnr: z.string().regex(PNR_PATTERN),
  label: z.string().min(1).max(200),
  addedAt: z.iso.datetime(),
  checks: z.array(historyPointSchema).max(40),
});

export const watchlistUpsertSchema = z.object({
  pnr: z.string().regex(PNR_PATTERN),
  label: z.string().trim().min(1).max(200),
  checks: z.array(historyPointSchema).max(40).default([]),
});

export const watchlistApiListSchema = z.object({ ok: z.literal(true), data: z.array(watchlistEntrySchema) });
export const watchlistApiItemSchema = z.object({ ok: z.literal(true), data: watchlistEntrySchema });
export const okSchema = z.object({ ok: z.literal(true) });

export type ApiError = z.infer<typeof apiErrorSchema>;
export type PnrApiOk = z.infer<typeof pnrApiOkSchema>;
export type PnrApiResponse = z.infer<typeof pnrApiResponseSchema>;
export type WatchlistUpsert = z.infer<typeof watchlistUpsertSchema>;

// Contract lock: the schemas must infer exactly the domain interfaces.
type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const resultContract: Equals<z.infer<typeof pnrResultSchema>, PnrResult> = true;
const historyContract: Equals<z.infer<typeof historyPointSchema>, HistoryPoint> = true;
const entryContract: Equals<z.infer<typeof watchlistEntrySchema>, WatchlistEntry> = true;
void resultContract;
void historyContract;
void entryContract;
