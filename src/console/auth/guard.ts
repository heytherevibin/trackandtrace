import { createConsoleDb, type ConsoleDb } from "@/console/auth/db";
import { parseConsoleMember, ROLE_RANK, type ConsoleMember, type ConsoleRole } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

const m = consoleMessages.session;

/**
 * PostgREST maps both 28000 (invalid authorization) and 42501 (insufficient privilege) to 403, so
 * the two are told apart by the text our own functions raise, not by the status that reaches us.
 * Anything else is a fault, and must not read to the member as an ordinary sign-out.
 */
function fromDatabase(message: string): AppError {
  if (message.includes("session ended")) return new AppError("UNAUTHENTICATED", m.ended, { status: 401 });
  if (message.includes("no access")) return new AppError("INVALID_INPUT", m.noAccess, { status: 403 });
  // A request carrying no session reaches PostgREST as `anon`, and console_me is granted to
  // `authenticated` alone -- so the database turns it away by permission rather than by saying the
  // session ended. That is still "you are not signed in", and answering it as an internal fault
  // would show a signed-out visitor an error page instead of the sign-in link they need.
  //
  // Narrowly on *function*: "permission denied for schema console" is the console's own
  // misconfiguration -- the shape the enum-argument bug took in 2c -- and must stay a fault rather
  // than quietly logging members out while the cause goes unreported.
  if (message.includes("permission denied for function")) return new AppError("UNAUTHENTICATED", m.ended, { status: 401 });
  return new AppError("INTERNAL", m.unavailable);
}

/**
 * The one gate every console page and route handler runs first (spec §C). `console_me` does the
 * real work in the database: the claims verify, the session is key-verified, current and not
 * revoked, and the member is active. `least` adds the module's role floor on top; the database
 * checks it again inside every function that changes anything.
 */
export async function requireConsoleMember(least?: ConsoleRole, db?: ConsoleDb): Promise<ConsoleMember> {
  const client = db ?? (await createConsoleDb());
  const { data, error } = await client.rpc("console_me");
  if (error) throw fromDatabase(error.message);
  const member = parseConsoleMember(data);
  if (least && ROLE_RANK[member.role] < ROLE_RANK[least]) {
    throw new AppError("INVALID_INPUT", m.noAccess, { status: 403 });
  }
  return member;
}
