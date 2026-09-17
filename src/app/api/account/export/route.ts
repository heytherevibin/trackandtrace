import { jsonError } from "@/services/api-response";
import { requireUser } from "@/services/session";
import { listEntries } from "@/services/watchlist-repo";

export const dynamic = "force-dynamic";

/** GET /api/account/export — a JSON attachment of the profile and saved PNRs. */
export async function GET(): Promise<Response> {
  try {
    const { user, db } = await requireUser();
    const body = {
      exportedAt: new Date().toISOString(),
      profile: { id: user.id, email: user.email, name: user.name },
      watchlist: await listEntries(db, user.id),
    };
    return new Response(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="trackandtrace-export.json"',
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
