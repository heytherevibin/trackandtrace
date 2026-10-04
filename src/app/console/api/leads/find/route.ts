import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { findLead } from "@/console/leads/leads";
import { findBody } from "@/console/leads/routes";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads/find — the lead with exactly this address, still masked, or null.
 *
 * A POST, though it changes no lead. The address being searched for must never sit in a URL, where
 * it would outlive the search in history, logs and referrers; and `console_find_lead` writes an
 * audit row for every lookup, found or not, so this is not a read that may be repeated for free.
 * `jsonOk` answers `no-store`.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("support");
    const { email } = await readBody(req, findBody);
    const lead = await findLead(await createConsoleDb(), consoleEnvironment(), email);
    return jsonOk({ ok: true, lead });
  } catch (err) {
    return jsonError(err);
  }
}
