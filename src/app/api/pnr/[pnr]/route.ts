import type { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/services/api-response";
import { queryPnr } from "@/services/pnr-query";
import { clientIp } from "@/services/rate-limit";

export const dynamic = "force-dynamic";

/** GET /api/pnr/[pnr]?fresh=1 — the full PnrResult envelope, validated by the client against the wire contract. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ pnr: string }> }): Promise<Response> {
  try {
    const { pnr } = await ctx.params;
    const ip = clientIp(null, req.headers.get("x-forwarded-for"));
    const fresh = req.nextUrl.searchParams.get("fresh") === "1";
    const out = await queryPnr(pnr, ip, { fresh });
    if (!out.ok) return jsonError(out.error);
    return jsonOk({
      ok: true,
      source: out.result.snapshot.source,
      cached: out.cached,
      latencyMs: out.latencyMs,
      rate: out.rate,
      data: out.result,
    });
  } catch (err) {
    return jsonError(err);
  }
}
