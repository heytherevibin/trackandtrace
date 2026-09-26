import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/services/api-response";
import { clientIp } from "@/services/rate-limit";
import { servingSampleData } from "@/services/sources";
import { queryStations } from "@/services/station-query";

export const dynamic = "force-dynamic";

// A GET with the query in the URL, like `/api/trains`: a station name is not personal data and this
// is a reference lookup. Nothing about a person is read, logged or stored on this path.
//
// It answers an EMPTY LIST for everything it cannot do — too short, rate limited, provider down.
// The field it feeds is an assistance while someone types, and an error there would interrupt them
// mid-word for no gain: they can always type the code, which is what they did before this existed.
const querySchema = z.object({ q: z.string().max(60) });

/** GET /api/stations?q=bengaluru — stations to pick from, by name or by exact code. */
export async function GET(req: NextRequest): Promise<Response> {
  try {
    const parsed = querySchema.safeParse({ q: req.nextUrl.searchParams.get("q") ?? "" });
    if (!parsed.success) return jsonOk({ ok: true, stations: [], cached: false, sampleData: servingSampleData() });

    const ip = clientIp(null, req.headers.get("x-forwarded-for"));
    const { stations, cached } = await queryStations(parsed.data.q, ip);
    return jsonOk({ ok: true, stations, cached, sampleData: servingSampleData() });
  } catch (err) {
    return jsonError(err);
  }
}
