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

export async function currentUserFrom(db: Db): Promise<SessionUser | null> {
  const { data, error } = await db.auth.getClaims();
  if (error || !data) return null;
  return userFromClaims(data.claims);
}

/** The signed-in user for server components and route handlers, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const db = await createServerSupabase();
  if (!db) return null;
  return currentUserFrom(db);
}

/** Route-handler guard: accounts configured and a verified session, or a typed error. */
export async function requireUser(): Promise<{ readonly user: SessionUser; readonly db: Db }> {
  const db = await createServerSupabase();
  if (!db) throw new AppError("SOURCE_UNAVAILABLE", "Accounts are not configured for this deployment.");
  const user = await currentUserFrom(db);
  if (!user) throw new AppError("UNAUTHENTICATED", "Sign in to use your account.");
  return { user, db };
}
