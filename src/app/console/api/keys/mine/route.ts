import { z } from "zod";
import { getMyKeys, renameMyKey } from "@/console/account/my-keys";
import { assertConsoleAvailable } from "@/console/availability";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

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

// console.keys checks 1..60 characters; refusing here keeps the database's own refusal for the
// cases only it can see (the same rule verify/route.ts's own registration schema already follows).
const patchBody = z.object({ keyId: z.guid(), name: z.string().trim().min(1).max(60) }).strict();

/**
 * PATCH /api/keys/mine -- rename a key (task-7). No tap: console_rename_key takes none,
 * deliberately (task-7-addendum.md §2.3). Unlike GET, this changes state, so it asserts same-origin
 * first, the same way every other mutating console route does (src/app/console/api/sign-in/route.ts).
 */
export async function PATCH(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember();
    const { keyId, name } = await readBody(req, patchBody);
    await renameMyKey(keyId, name, consoleEnvironment());
    return jsonOk({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
