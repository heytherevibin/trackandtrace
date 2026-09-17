import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonOk } from "@/services/api-response";
import { AppError } from "@/services/errors";
import { readBody } from "@/services/request-body";
import { requireUser } from "@/services/session";
import { createAdminSupabase } from "@/services/supabase/admin";
import { deleteAllForUser } from "@/services/watchlist-repo";

export const dynamic = "force-dynamic";

const deleteBodySchema = z.object({ confirm: z.literal(true) });

/** DELETE /api/account — remove the watchlist, then the auth user, then the session. Irreversible. */
export async function DELETE(req: NextRequest): Promise<Response> {
  try {
    const { user, db } = await requireUser();
    await readBody(req, deleteBodySchema);
    await deleteAllForUser(db, user.id);
    const admin = createAdminSupabase();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new AppError("INTERNAL", "The account could not be deleted. Nothing else was changed.");
    await db.auth.signOut();
    return jsonOk({ ok: true, message: "Your account and saved records were deleted." });
  } catch (err) {
    return jsonError(err);
  }
}
