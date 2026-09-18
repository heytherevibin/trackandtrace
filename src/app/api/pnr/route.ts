import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/services/api-response";
import { queryPnr } from "@/services/pnr-query";
import { clientIp } from "@/services/rate-limit";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

// The PNR travels in the JSON body: request bodies are not recorded in platform request logs, while
// paths and query strings are. Validation of the digits stays in queryPnr, so the error envelope
// matches every other path.
const bodySchema = z.object({ pnr: z.string().max(32), fresh: z.boolean().optional() }).strict();

/** POST /api/pnr { pnr, fresh? } — the full PnrResult envelope, validated by the client against the wire contract. */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const { pnr, fresh } = await readBody(req, bodySchema);
    const ip = clientIp(null, req.headers.get("x-forwarded-for"));
    const out = await queryPnr(pnr, ip, { fresh: fresh === true });
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
