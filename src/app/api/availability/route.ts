import type { NextRequest } from "next/server";
import { availabilityBodySchema } from "./schema";
import { queryAvailability, queryAvailabilityClasses } from "@/services/availability-query";
import { jsonError, jsonOk } from "@/services/api-response";
import { clientIp } from "@/services/rate-limit";
import { readBody } from "@/services/request-body";
import { servingSampleData } from "@/services/sources";

export const dynamic = "force-dynamic";

// POST, not GET: this spends a provider request from a shared monthly plan, so it must not be
// reachable by a crawler following a link or by a browser prefetching one. Nothing here is personal
// — a train and two stations — but a body keeps the journey out of platform request logs too.
//
// One route, two questions, because they are the same question with a different class count:
// `travelClass` is one journey's chart; `travelClasses` is a row of the route list being opened.
// A second endpoint would have duplicated the limiter, the budget and the recording for nothing.

/** POST /api/availability — one live read of the reservation chart for one journey. */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await readBody(req, availabilityBodySchema);
    const ip = clientIp(null, req.headers.get("x-forwarded-for"));
    const sampleData = servingSampleData();

    if ("travelClasses" in body) {
      const { travelClasses, ...journey } = body;
      const { outcome, answers, failedClasses, remaining } = await queryAvailabilityClasses(journey, travelClasses, ip);
      if (!outcome.ok) return jsonError(outcome);
      return jsonOk({ ok: true, remaining, sampleData, answers, failedClasses });
    }

    const { outcome, remaining } = await queryAvailability(body, ip);
    if (!outcome.ok) return jsonError(outcome);
    // `days` is the answer. There is no branch here that can produce it empty from a failure: an
    // outcome that is not ok never reaches this line.
    return jsonOk({ ok: true, remaining, sampleData, ...outcome.answer });
  } catch (err) {
    return jsonError(err);
  }
}
