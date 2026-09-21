import { getMyKeys } from "@/console/account/my-keys";
import { assertConsoleAvailable } from "@/console/availability";
import { requireConsoleMember } from "@/console/auth/guard";
import { jsonError, jsonOk } from "@/services/api-response";

export const dynamic = "force-dynamic";

/**
 * GET /api/keys/mine -- the signed-in member's own keys and profile, in the one round trip
 * `console_my_keys` already makes. The My keys page (src/app/console/keys/page.tsx) renders this
 * data server-side on first load and does not call this route itself, the same way every other
 * console page reads its own data directly rather than fetching its own API; this route is the
 * surface a client component re-fetches from once Rename/Remove/Add exist to mutate what it shows.
 */
export async function GET(): Promise<Response> {
  try {
    assertConsoleAvailable();
    await requireConsoleMember();
    const { keys, member } = await getMyKeys();
    return jsonOk({ ok: true, keys, member });
  } catch (err) {
    return jsonError(err);
  }
}
