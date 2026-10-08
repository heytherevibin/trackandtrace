import { cache } from "react";
import { AppError } from "./errors";
import { createServerSupabase, type Db } from "./supabase/server";

import type { SessionUser } from "@/types/session";

export type { SessionUser };

/** Legacy alias kept while pages migrate. */
export type CurrentUser = SessionUser;

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Build the DTO from verified JWT claims. Returns null when the subject is missing. */
export function userFromClaims(claims: unknown): SessionUser | null {
  if (typeof claims !== "object" || claims === null) return null;
  const c = claims as Record<string, unknown>;
  const id = str(c.sub);
  if (!id) return null;
  const meta = typeof c.user_metadata === "object" && c.user_metadata !== null ? (c.user_metadata as Record<string, unknown>) : {};
  return {
    id,
    email: str(c.email),
    name: str(meta.full_name) ?? str(meta.name),
    avatarUrl: str(meta.avatar_url) ?? str(meta.picture),
  };
}

/**
 * Whether the database says the session behind a verified token is over: ended from the console
 * (Sign out everywhere), or its account disabled (20261011090000_console_account_acts.sql).
 *
 * A token is checked by its signature and stays good for up to an hour after its session is gone,
 * so those two acts would otherwise wait that hour out. This is the check that makes them take
 * effect at once.
 *
 * ONLY A PLAIN "NO" ENDS A SESSION. A check that fails, or answers anything else, leaves the
 * traveller signed in: their saved PNRs are guarded by the same rule inside the database, which
 * needs no answer from here, and a database that cannot be reached must not sign everybody out.
 */
async function sessionEnded(db: Db): Promise<boolean> {
  try {
    const { data, error } = await db.rpc("session_live");
    return !error && data === false;
  } catch {
    return false;
  }
}

export async function currentUserFrom(db: Db): Promise<SessionUser | null> {
  const { data, error } = await db.auth.getClaims();
  if (error || !data) return null;
  const user = userFromClaims(data.claims);
  if (!user) return null;
  return (await sessionEnded(db)) ? null : user;
}

/**
 * The signed-in user for server components and route handlers, or null.
 *
 * Remembered for the length of one render: the site's layout and the page under it both ask, and
 * the answer now costs a question to the database, which one request need only ask once.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const db = await createServerSupabase();
  if (!db) return null;
  return currentUserFrom(db);
});

/** Route-handler guard: accounts configured and a verified session, or a typed error. */
export async function requireUser(): Promise<{ readonly user: SessionUser; readonly db: Db }> {
  const db = await createServerSupabase();
  if (!db) throw new AppError("SOURCE_UNAVAILABLE", "Accounts are not configured for this deployment.");
  const user = await currentUserFrom(db);
  if (!user) throw new AppError("UNAUTHENTICATED", "Sign in to use your account.");
  return { user, db };
}
