import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/services/api-response";
import { clientIp } from "@/services/rate-limit";
import { queryRoute } from "@/services/route-query";

export const dynamic = "force-dynamic";

// Station codes travel in the query string, unlike a PNR in its body: a code is not personal data,
// and a GET is what a reference lookup should be. Nothing about a person is read, logged or stored
// on this path — the question is which trains run between two places.
const pairSchema = z.object({ from: z.string().min(1).max(8), to: z.string().min(1).max(8) });

/** GET /api/trains?from=SBC&to=NDLS — the trains on a pair, for the pre-booking form's train field. */
export async function GET(req: NextRequest): Promise<Response> {
  try {
    const parsed = pairSchema.safeParse({ from: req.nextUrl.searchParams.get("from") ?? "", to: req.nextUrl.searchParams.get("to") ?? "" });
    if (!parsed.success) return jsonError({ ok: false, code: "INVALID", message: "Give a From and a To station code." });

    const ip = clientIp(null, req.headers.get("x-forwarded-for"));
    const { outcome, remaining } = await queryRoute(parsed.data.from, parsed.data.to, ip);
    if (!outcome.ok) return jsonError(outcome);
    return jsonOk({ ok: true, remaining, ...outcome.answer });
  } catch (err) {
    return jsonError(err);
  }
}
