import { assertConsoleAvailable } from "@/console/availability";
import { requireConsoleMember } from "@/console/auth/guard";
import { getTeam } from "@/console/team/team";
import { jsonError, jsonOk } from "@/services/api-response";

export const dynamic = "force-dynamic";

/**
 * GET /api/team -- the Owner-only roster and pending invites (Task 3), in the one round trip
 * `console_team` already makes. The Team page (src/app/console/team/page.tsx) renders this data
 * server-side on first load and does not call this route itself, the same way every other console
 * page reads its own data directly rather than fetching its own API
 * (src/app/console/api/keys/mine/route.ts's own comment); this route is the surface a client
 * component re-fetches from once Tasks 4-7 exist to mutate what it shows.
 */
export async function GET(): Promise<Response> {
  try {
    assertConsoleAvailable();
    await requireConsoleMember("owner");
    const { members, invites } = await getTeam();
    return jsonOk({ ok: true, members, invites });
  } catch (err) {
    return jsonError(err);
  }
}
