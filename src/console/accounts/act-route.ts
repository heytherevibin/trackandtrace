import { actOnAccount } from "@/console/accounts/accounts";
import type { AccountAct } from "@/console/accounts/acts";
import { actBody } from "@/console/accounts/routes";
import { createConsoleDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { consoleEnvironment } from "@/console/auth/session";
import { assertConsoleAvailable } from "@/console/availability";
import { assertSameOrigin } from "@/console/same-origin";
import { jsonError, jsonOk } from "@/services/api-response";
import { readBody } from "@/services/request-body";

/**
 * The handler the three acts share: Sign out everywhere, Disable and Enable differ in which
 * database function they call and in nothing a route decides.
 *
 * Behind a reason and a key: the member tapped for exactly this id, value and reason, and the
 * database spends that tap by re-digesting them, so they are passed through and never rebuilt
 * here. It refuses a value minted for another deployment, an account that is not there and an act
 * that has nothing to do, each before the tap is spent.
 */
export function accountActRoute(act: AccountAct): (req: Request) => Promise<Response> {
  return async (req) => {
    try {
      assertConsoleAvailable();
      assertSameOrigin(req);
      await requireConsoleMember("admin");
      const input = await readBody(req, actBody);
      await actOnAccount(await createConsoleDb(), act, consoleEnvironment(), input.id, input.value, input.reason);
      return jsonOk({ ok: true });
    } catch (err) {
      return jsonError(err);
    }
  };
}
