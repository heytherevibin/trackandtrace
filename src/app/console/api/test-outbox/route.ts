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
 *
 * An optional `?to=` reads only that address's letters, leaving every other test's letters in place,
 * so concurrent end-to-end specs cannot drain each other's outbox. With no `to`, behaviour is exactly
 * as before: everything captured since the last read.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    if (!env().E2E) throw new AppError("NOT_FOUND", consoleMessages.session.noAccess, { status: 404 });
    const to = new URL(req.url).searchParams.get("to") ?? undefined;
    return jsonOk({ ok: true, letters: outbox.take(to) });
  } catch (err) {
    return jsonError(err);
  }
}
