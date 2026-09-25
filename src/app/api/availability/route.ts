import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/services/api-response";
import { queryAvailability } from "@/services/availability-query";
import { clientIp } from "@/services/rate-limit";
import { readBody } from "@/services/request-body";
import { bookingClassSchema, quotaSchema } from "@/types/schemas";

export const dynamic = "force-dynamic";

// POST, not GET: this spends a provider request from a shared monthly plan, so it must not be
// reachable by a crawler following a link or by a browser prefetching one. Nothing here is personal
// — a train and two stations — but a body keeps the journey out of platform request logs too.
const bodySchema = z
  .object({
    trainNo: z.string().regex(/^\d{5}$/),
    from: z.string().min(2).max(5),
    to: z.string().min(2).max(5),
    journeyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    travelClass: bookingClassSchema,
    quota: quotaSchema,
  })
  .strict();

/** POST /api/availability — one live read of the reservation chart for one journey. */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const request = await readBody(req, bodySchema);
    const ip = clientIp(null, req.headers.get("x-forwarded-for"));
    const { outcome, remaining } = await queryAvailability(request, ip);
    if (!outcome.ok) return jsonError(outcome);
    // `days` is the answer. There is no branch here that can produce it empty from a failure: an
    // outcome that is not ok never reaches this line.
    return jsonOk({ ok: true, remaining, ...outcome.answer });
  } catch (err) {
    return jsonError(err);
  }
}
