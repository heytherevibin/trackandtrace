// Previews and local servers use the production Supabase project, so the console would act on real data there.
// It runs in production, or locally against a local database (or none, when there is nothing to act on).

import { consoleMessages } from "@/console/messages";
import { env } from "@/services/env";
import { AppError } from "@/services/errors";
import { supabasePublicEnv } from "@/services/supabase/public-env";

export type ConsoleAvailability = "available" | "production-only" | "local-database-needed";

const LOCAL_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function consoleAvailability(current: { readonly VERCEL_ENV?: string; readonly NEXT_PUBLIC_SUPABASE_URL?: string }): ConsoleAvailability {
  if (current.VERCEL_ENV === "production") return "available";
  if (current.VERCEL_ENV === "preview") return "production-only";
  if (!current.NEXT_PUBLIC_SUPABASE_URL) return "available";
  try {
    return LOCAL_HOSTS.has(new URL(current.NEXT_PUBLIC_SUPABASE_URL).hostname) ? "available" : "local-database-needed";
  } catch {
    return "local-database-needed";
  }
}

/**
 * The one gate every console entry point must pass, reading the same Supabase URL the Supabase
 * clients themselves read (`supabasePublicEnv.url`), not `env()`'s own copy of it: `env()` drops an
 * otherwise-valid `NEXT_PUBLIC_SUPABASE_URL` whenever any *other* variable fails validation outside
 * production, which would silently reopen the console against the hosted project. Throws when the
 * console must not run here; callers that render instead of throwing keep calling
 * `consoleAvailability` directly (see `src/app/console/layout.tsx`).
 */
export function assertConsoleAvailable(): void {
  const availability = consoleAvailability({ VERCEL_ENV: env().VERCEL_ENV, NEXT_PUBLIC_SUPABASE_URL: supabasePublicEnv.url });
  if (availability === "available") return;
  const m = consoleMessages.availability;
  const message = availability === "production-only" ? m.productionOnly : m.localDatabase;
  throw new AppError("CONSOLE_UNAVAILABLE", message, { status: 503 });
}
