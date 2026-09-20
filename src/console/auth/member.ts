import { z } from "zod";
import { AppError } from "@/services/errors";
import { consoleMessages } from "@/console/messages";

export type ConsoleRole = "owner" | "admin" | "support" | "viewer";
export type ConsoleMemberStatus = "setup" | "active" | "removed";

export interface ConsoleMember {
  readonly userId: string;
  readonly email: string;
  readonly name: string;
  readonly role: ConsoleRole;
  readonly status: ConsoleMemberStatus;
}

/** The same order `console.role_rank` gives. A role this map does not name is not a role. */
export const ROLE_RANK: Readonly<Record<ConsoleRole, number>> = { owner: 4, admin: 3, support: 2, viewer: 1 } as const;

const shape = z.object({
  // z.guid(), not z.uuid(): the latter enforces the RFC4122 version/variant nibbles, which real
  // auth.users ids satisfy but which is no part of the shape console_me actually promises.
  user_id: z.guid(),
  email: z.string().min(3).max(254),
  name: z.string().min(1).max(120),
  role: z.enum(["owner", "admin", "support", "viewer"]),
  status: z.enum(["setup", "active", "removed"]),
});

/** `console_me` returns `Json`. Anything that is not a whole member reads as no session at all. */
export function parseConsoleMember(value: unknown): ConsoleMember {
  const parsed = shape.safeParse(value);
  if (!parsed.success) throw new AppError("UNAUTHENTICATED", consoleMessages.session.ended, { status: 401 });
  const { user_id, email, name, role, status } = parsed.data;
  return { userId: user_id, email, name, role, status };
}

export interface AuthMember extends ConsoleMember {
  readonly keyCount: number;
}

const authMemberShape = shape.extend({ key_count: z.number().int().nonnegative() });

/**
 * `console_auth_member_by_email` returns the same shape `console_me` does, plus `key_count`. This
 * runs on the confirm route's last gate before a console session exists, where "not a member" is an
 * ordinary answer, not a failure -- unlike `parseConsoleMember`'s callers, who are already inside a
 * session and for whom a bad shape really does mean "ended" -- so this returns null rather than
 * throwing. Parsing the whole shape (not just casting the fields a caller happens to read) means a
 * drifted field name fails closed here instead of silently no longer excluding a removed member.
 */
export function parseAuthMember(value: unknown): AuthMember | null {
  const parsed = authMemberShape.safeParse(value);
  if (!parsed.success) return null;
  const { user_id, email, name, role, status, key_count } = parsed.data;
  return { userId: user_id, email, name, role, status, keyCount: key_count };
}

/**
 * The console session is keyed by the JWT's own `session_id` claim, because that is what
 * `console.current_member()` reads back out of `request.jwt.claims`. No other id would ever match.
 */
export function sessionIdFromClaims(claims: unknown): string | null {
  if (typeof claims !== "object" || claims === null) return null;
  const value = (claims as Record<string, unknown>).session_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}
