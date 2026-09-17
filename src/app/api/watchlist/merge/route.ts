import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";
import { requireUser } from "@/services/session";
import { listEntries, upsertEntry } from "@/services/watchlist-repo";
import { assertWriteAllowed } from "@/services/write-limit";
import { watchlistUpsertSchema } from "@/types/schemas";

export const dynamic = "force-dynamic";

const mergeBodySchema = z.object({ entries: z.array(watchlistUpsertSchema).min(1).max(50) });

/** POST /api/watchlist/merge — move device-only entries onto the account in one call. Returns the full list. */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const { user, db } = await requireUser();
    await assertWriteAllowed(user.id);
    const { entries } = await readBody(req, mergeBodySchema);
    for (const entry of entries) await upsertEntry(db, user.id, entry);
    return jsonOk({ ok: true, data: await listEntries(db, user.id) });
  } catch (err) {
    return jsonError(err);
  }
}
