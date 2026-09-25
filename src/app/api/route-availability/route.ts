import type { NextRequest } from "next/server";
import { routeAvailabilityBodySchema } from "./schema";
import { jsonError, jsonOk } from "@/services/api-response";
import { clientIp } from "@/services/rate-limit";
import { readBody } from "@/services/request-body";
import { queryRouteAvailability } from "@/services/route-availability-query";
import { servingSampleData } from "@/services/sources";

export const dynamic = "force-dynamic";

// POST for the same reason the single-journey route is POST: it spends provider requests from a
// shared monthly plan — up to twelve of them — so it must not be reachable by a crawler following
// a link or a browser prefetching one. Nothing here is personal: two stations, a date and a list of
// classes. A body keeps the journey out of platform request logs too.

/** POST /api/route-availability — every train on a pair, each with the first chosen class. */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const request = await readBody(req, routeAvailabilityBodySchema);
    const ip = clientIp(null, req.headers.get("x-forwarded-for"));
    const { outcome, remaining } = await queryRouteAvailability(request, ip);
    if (!outcome.ok) return jsonError(outcome);
    // `rows` is the answer. No branch here can produce it from a failure: an outcome that is not ok
    // never reaches this line, so an empty list always means "no trains run that pair".
    return jsonOk({ ok: true, remaining, sampleData: servingSampleData(), ...outcome.answer });
  } catch (err) {
    return jsonError(err);
  }
}
