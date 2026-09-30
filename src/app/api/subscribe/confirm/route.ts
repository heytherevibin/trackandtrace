import { z } from "zod";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";
import { confirmRow } from "@/services/subscriptions/store";
import { tokenHash } from "@/services/subscriptions/subscribe";

export const dynamic = "force-dynamic";

const body = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();

/**
 * POST /api/subscribe/confirm — the page's Confirm button.
 *
 * A POST, not the link itself: opening the link must change nothing, because mail clients and
 * scanners follow links. Only the token's hash reaches the database.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const { token } = await readBody(req, body);
    const { state, list } = await confirmRow(tokenHash(token));
    return jsonOk({ ok: true, state, list });
  } catch (err) {
    return jsonError(err);
  }
}
