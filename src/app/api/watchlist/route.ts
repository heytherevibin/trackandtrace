import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";
import { requireUser } from "@/services/session";
import { deleteEntry, listEntries, upsertEntry } from "@/services/watchlist-repo";
import { assertWriteAllowed } from "@/services/write-limit";
import { watchlistUpsertSchema } from "@/types/schemas";
import { pnrSchema } from "@/utils/pnr";

export const dynamic = "force-dynamic";

const deleteBodySchema = z.object({ pnr: pnrSchema });

/** GET /api/watchlist — the signed-in user's saved PNRs, newest first. */
export async function GET(): Promise<Response> {
  try {
    const { user, db } = await requireUser();
    return jsonOk({ ok: true, data: await listEntries(db, user.id) });
  } catch (err) {
    return jsonError(err);
  }
}

/** POST /api/watchlist — save or update one PNR on the account. */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const { user, db } = await requireUser();
    await assertWriteAllowed(user.id);
    const input = await readBody(req, watchlistUpsertSchema);
    return jsonOk({ ok: true, data: await upsertEntry(db, user.id, input) });
  } catch (err) {
    return jsonError(err);
  }
}

/** DELETE /api/watchlist — remove one PNR from the account. */
export async function DELETE(req: NextRequest): Promise<Response> {
  try {
    const { user, db } = await requireUser();
    await assertWriteAllowed(user.id);
    const { pnr } = await readBody(req, deleteBodySchema);
    await deleteEntry(db, user.id, pnr);
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
