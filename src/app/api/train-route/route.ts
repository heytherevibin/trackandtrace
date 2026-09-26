import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/services/api-response";
import { clientIp } from "@/services/rate-limit";
import { servingSampleData } from "@/services/sources";
import { queryTrainRoute } from "@/services/train-route-query";

export const dynamic = "force-dynamic";

// GET, and the train number in the query string, for the same reason `/api/trains` is a GET: a
// train number is not personal data and a timetable is a reference lookup. Nothing about a person
// is read, logged or stored on this path.
//
// It is reached once per train a reader OPENS, never once per train in a list — and the answer is
// held in the shared store for a day, so a popular train is fetched once for everybody.
const trainSchema = z.object({ train: z.string().regex(/^\d{5}$/) });

/** GET /api/train-route?train=12601 — every station that train calls at, in order. */
export async function GET(req: NextRequest): Promise<Response> {
  try {
    const parsed = trainSchema.safeParse({ train: req.nextUrl.searchParams.get("train") ?? "" });
    if (!parsed.success) return jsonError({ ok: false, code: "INVALID", message: "Give a five-digit train number." });

    const ip = clientIp(null, req.headers.get("x-forwarded-for"));
    const { outcome, remaining, cached } = await queryTrainRoute(parsed.data.train, ip);
    if (!outcome.ok) return jsonError(outcome);
    // `stops` is the answer. No branch here can produce it from a failure: an outcome that is not
    // ok never reaches this line, so a run that arrives is always a run the provider gave.
    return jsonOk({ ok: true, remaining, cached, sampleData: servingSampleData(), ...outcome.answer });
  } catch (err) {
    return jsonError(err);
  }
}
