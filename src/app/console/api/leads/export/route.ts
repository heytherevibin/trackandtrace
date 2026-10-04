import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { exportLeads } from "@/console/leads/leads";
import { exportBody } from "@/console/leads/routes";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

export const dynamic = "force-dynamic";

/**
 * POST /api/leads/export — the filtered list as a CSV, whole addresses and all. Owner and Admin,
 * behind a reason and a key: `console_export_leads` spends the tap by re-digesting the filters and
 * the reason exactly as sent, takes the rows and writes the audit row in one transaction. The file
 * is answered once, `no-store`, and held only by the page that asked for it.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    assertConsoleAvailable();
    assertSameOrigin(req);
    await requireConsoleMember("admin");
    const input = await readBody(req, exportBody);
    const file = await exportLeads(await createConsoleDb(), consoleEnvironment(), input.filters, input.reason, new Date());
    return jsonOk({ ok: true, csv: file.csv, count: file.count, fileName: file.fileName });
  } catch (err) {
    return jsonError(err);
  }
}
