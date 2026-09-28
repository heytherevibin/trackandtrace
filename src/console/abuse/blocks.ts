import { BLOCK_ACTION, UNBLOCK_ACTION, blockTapValue, unblockTapValue } from "@/console/abuse/abuse";
import type { ConsoleAuditRow } from "@/console/auth/audit";
import type { ConsoleRole } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { durationUntil, type BlockDuration, type Blocklist } from "@/services/blocklist";
import { AppError } from "@/services/errors";

// Blocking, server side. Two stores, one order: the DATABASE approves and records (it spends the tap
// and writes the Done row in one transaction, or raises and does neither), and only then is Upstash
// written. The reverse order would put a block in force that no tap approved, however briefly.
//
// The cost of this order is the case where the database said yes and Upstash then failed: the audit
// log holds a Done row for a block that is not in force. So a Failed row follows it at once, and the
// member is told nothing changed — the log reads "Done, then Failed", which is what happened.

const m = consoleMessages.abuse;

/** The one call the database takes. Narrow on purpose, so a test can stand in for the client. */
export interface BlocksDb {
  rpc(fn: "console_block_address" | "console_unblock_address", args: { p_environment: string; p_target: string; p_value: string; p_reason: string }): PromiseLike<{ readonly error: { readonly message: string } | null }>;
}

export interface BlockDeps {
  readonly db: BlocksDb;
  readonly list: Blocklist;
  /** Writes a row through the service client — used only for the Failed row. */
  readonly audit: (row: ConsoleAuditRow) => Promise<void>;
  /** Applies the change on this instance at once; the others follow within 30 seconds. */
  readonly invalidate: () => void;
}

export interface Actor {
  readonly userId: string;
  readonly name: string;
  readonly role: ConsoleRole;
}

function fromBlockError(error: { readonly message: string }): AppError {
  if (error.message.includes("no tap for this action")) return new AppError("INVALID_INPUT", m.errors.tapMismatch, { status: 403 });
  if (error.message.includes("no access")) return new AppError("INVALID_INPUT", m.errors.noAccess, { status: 403 });
  if (/hash|duration|environment|note|value/.test(error.message)) return new AppError("INVALID_INPUT", m.errors.invalid);
  return new AppError("SOURCE_UNAVAILABLE", m.errors.database);
}

async function failed(deps: BlockDeps, actor: Actor, action: string, member: string, reason: string): Promise<void> {
  await deps.audit({ actor: actor.userId, actorName: actor.name, actorRole: actor.role, category: "configure", action, target: member, reason, result: "failed" }).catch(() => undefined);
}

export async function blockAddress(
  ask: { readonly member: string; readonly duration: BlockDuration; readonly note: string; readonly reason: string; readonly environment: string; readonly actor: Actor; readonly keyId: string; readonly now: number },
  deps: BlockDeps,
): Promise<void> {
  const { error } = await deps.db.rpc("console_block_address", {
    p_environment: ask.environment,
    p_target: ask.member,
    p_value: blockTapValue(ask.environment, ask.duration, ask.note),
    p_reason: ask.reason,
  });
  if (error) throw fromBlockError(error);
  try {
    await deps.list.block(ask.member, { note: ask.note, by: ask.actor.name, since: ask.now, until: durationUntil(ask.duration, ask.now), keyId: ask.keyId });
  } catch {
    await failed(deps, ask.actor, BLOCK_ACTION, ask.member, ask.reason);
    throw new AppError("SOURCE_UNAVAILABLE", m.errors.notBlocked);
  }
  deps.invalidate();
}

export async function unblockAddress(
  ask: { readonly member: string; readonly reason: string; readonly environment: string; readonly actor: Actor },
  deps: BlockDeps,
): Promise<void> {
  const { error } = await deps.db.rpc("console_unblock_address", {
    p_environment: ask.environment,
    p_target: ask.member,
    p_value: unblockTapValue(ask.environment),
    p_reason: ask.reason,
  });
  if (error) throw fromBlockError(error);
  try {
    await deps.list.unblock(ask.member);
  } catch {
    await failed(deps, ask.actor, UNBLOCK_ACTION, ask.member, ask.reason);
    throw new AppError("SOURCE_UNAVAILABLE", m.errors.notUnblocked);
  }
  deps.invalidate();
}
