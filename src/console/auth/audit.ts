import type { ConsoleDb } from "@/console/auth/db";
import type { ConsoleRole } from "@/console/auth/member";
import { consoleEnvironment } from "@/console/auth/session";
import { log } from "@/services/log";

export interface ConsoleAuditRow {
  readonly actor: string | null;
  readonly actorName: string | null;
  readonly actorRole: ConsoleRole | null;
  readonly keyId?: string | null;
  readonly sessionLabel?: string | null;
  readonly category: "session" | "team" | "configure" | "messages" | "provider_keys" | "leads";
  readonly action: string;
  readonly target: string | null;
  readonly reason?: string | null;
  readonly result: "done" | "refused" | "failed";
  readonly addressHash?: string | null;
  readonly before?: unknown;
  readonly after?: unknown;
}

/**
 * The service-role passthrough (`public.console_auth_write_audit`) for the things that happen
 * before a member function could log them itself: signing in, adding a key, a tap that failed.
 * Writing history must never be what breaks the action it describes, so a failure is logged here
 * and nothing more.
 */
export async function writeConsoleAudit(service: ConsoleDb, row: ConsoleAuditRow): Promise<void> {
  const { error } = await service.rpc("console_auth_write_audit", {
    p_environment: consoleEnvironment(),
    // console_auth_write_audit's generated Args type carries no `| null`: a Postgres function
    // parameter has no not-null-ness the type generator could see, and every field below is
    // genuinely optional in the SQL signature (console.audit_log's own NOT NULL columns are
    // environment, actor_name, category, action and result -- this function always supplies all
    // five). One cast per field that can be absent, same escape hatch `ceremony.ts`'s `mint()`
    // uses for its own p_digest.
    p_actor: row.actor as never,
    p_actor_name: row.actorName as never,
    p_actor_role: row.actorRole as never,
    p_key_id: (row.keyId ?? null) as never,
    p_session_label: (row.sessionLabel ?? null) as never,
    p_category: row.category,
    p_action: row.action,
    p_target: row.target as never,
    p_reason: (row.reason ?? null) as never,
    p_result: row.result,
    p_address_hash: (row.addressHash ?? null) as never,
    p_before: (row.before ?? null) as never,
    p_after: (row.after ?? null) as never,
  });
  if (error) log.warn("[console] an audit row could not be written", { action: row.action, message: error.message });
}
