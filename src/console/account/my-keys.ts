import { z } from "zod";
import { createConsoleDb, type ConsoleDb } from "@/console/auth/db";
import type { ConsoleRole } from "@/console/auth/member";
import type { ConsoleKeyType } from "@/console/keys/webauthn";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

export interface MyKeysRow {
  readonly id: string;
  readonly name: string;
  readonly type: ConsoleKeyType;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
}

export interface MyKeysProfile {
  readonly name: string;
  readonly email: string;
  readonly role: ConsoleRole;
  readonly createdAt: string;
}

export interface MyKeys {
  readonly keys: readonly MyKeysRow[];
  readonly member: MyKeysProfile;
}

// Parsed, not cast (task-6-addendum.md §4 -- three reviews in the previous plan flagged exactly a
// cast on this kind of wrapper). A field drifting on console_my_keys must fail closed here -- read
// as "couldn't load" -- rather than hand the page a shape it treats as real. credential_id and
// public_key are deliberately absent from the function's own return
// (supabase/migrations/20260921100000_console_my_keys.sql) and so absent here too: this schema does
// not accept them even if a future drift on the database side put them back.
const keyShape = z.object({
  id: z.guid(),
  name: z.string().min(1).max(60),
  type: z.enum(["passkey", "security_key"]),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
});

const memberShape = z.object({
  name: z.string().min(1).max(120),
  email: z.string().min(3).max(254),
  role: z.enum(["owner", "admin", "support", "viewer"]),
  created_at: z.string(),
});

const myKeysShape = z.object({
  keys: z.array(keyShape),
  member: memberShape,
});

function unavailable(): AppError {
  return new AppError("SOURCE_UNAVAILABLE", consoleMessages.session.unavailable, { status: 503 });
}

/**
 * `console_rename_key` raises a plain 'no access' text (errcode 42501) for a key that either does
 * not exist or belongs to someone else -- console.current_member() never lets the caller find out
 * which. Told apart from any other database fault the same way guard.ts's fromDatabase already does
 * for console_me, so this member sees the console's own line rather than a raw 500
 * (task-7-addendum.md: "a name the route accepts and the database rejects is a 500 where a readable
 * refusal belongs").
 */
function fromRenameError(message: string): AppError {
  if (message.includes("no access")) return new AppError("INVALID_INPUT", consoleMessages.session.noAccess, { status: 403 });
  return unavailable();
}

/**
 * A thin typed wrapper over `console_my_keys` (spec §D): the signed-in member's own keys and their
 * profile, in the one round trip the function already makes -- the Keys plate and the Profile plate
 * are both fed from this single call, not two (task-6-addendum.md §3).
 */
export async function getMyKeys(db?: ConsoleDb): Promise<MyKeys> {
  const client = db ?? (await createConsoleDb());
  const { data, error } = await client.rpc("console_my_keys");
  if (error) throw unavailable();
  const parsed = myKeysShape.safeParse(data);
  if (!parsed.success) throw unavailable();
  return {
    keys: parsed.data.keys.map((k) => ({ id: k.id, name: k.name, type: k.type, createdAt: k.created_at, lastUsedAt: k.last_used_at })),
    member: { name: parsed.data.member.name, email: parsed.data.member.email, role: parsed.data.member.role, createdAt: parsed.data.member.created_at },
  };
}

/**
 * A thin wrapper over `console_rename_key` (task-7-addendum.md §2): three arguments, no tap -- a
 * name is a label, not a security boundary. `environment` is the caller's own
 * `consoleEnvironment()` (`@/console/auth/session`), the same way every other audit-writing
 * function in this console takes it, since only the caller knows which deployment this request
 * landed on.
 */
export async function renameMyKey(keyId: string, name: string, environment: string, db?: ConsoleDb): Promise<void> {
  const client = db ?? (await createConsoleDb());
  const { error } = await client.rpc("console_rename_key", { p_key: keyId, p_name: name, p_environment: environment });
  if (error) throw fromRenameError(error.message);
}
