import { consoleMessages } from "@/console/messages";
import { outbox } from "@/console/email/outbox";
import { jsonError, jsonOk } from "@/services/api-response";
import { env } from "@/services/env";
import { AppError } from "@/services/errors";

export const dynamic = "force-dynamic";

/**
 * The end-to-end run's letterbox. It exists only under E2E=1, which the environment check refuses
 * in production (src/services/env.ts), so this is a 404 on every real deployment -- twice over,
 * since a production build never has E2E set either.
 */
export async function GET(): Promise<Response> {
  try {
    if (!env().E2E) throw new AppError("NOT_FOUND", consoleMessages.session.noAccess, { status: 404 });
    return jsonOk({ ok: true, letters: outbox.take() });
  } catch (err) {
    return jsonError(err);
  }
}
