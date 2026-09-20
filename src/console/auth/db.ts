import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { consoleMessages } from "@/console/messages";
import { env } from "@/services/env";
import { AppError } from "@/services/errors";
import { isSupabaseConfigured, supabasePublicEnv } from "@/services/supabase/public-env";
import type { Database } from "@/types/supabase";

export type ConsoleDb = SupabaseClient<Database>;

/**
 * The console's own cookie. Same Supabase project as the traveller site, different name and
 * different host: cookies are host-only, so `trakline.in` never sends this one to
 * `admin.trakline.in`, and a traveller session can never be mistaken for a console session.
 */
export const CONSOLE_COOKIE_NAME = "sb-console-auth-token";

function unavailable(): AppError {
  return new AppError("CONSOLE_UNAVAILABLE", consoleMessages.availability.localDatabase, { status: 503 });
}

/** The member's own client: whatever the console cookie holds, with the member's own privileges. */
export async function createConsoleDb(): Promise<ConsoleDb> {
  if (!isSupabaseConfigured()) throw unavailable();
  const store = await cookies();
  return createServerClient<Database>(supabasePublicEnv.url, supabasePublicEnv.publishableKey, {
    cookieOptions: { name: CONSOLE_COOKIE_NAME },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // A Server Component render: cookies are read-only there. Route handlers do the writing.
        }
      },
    },
  });
}

/**
 * The service-role client, for the steps that happen before a key-verified session exists:
 * looking a member up, opening a session, minting and spending challenges, recording a key.
 * Every one of those is a `console_auth_*` function; this client can reach nothing else in the
 * console schema, which has no `usage` for any role.
 */
export function createConsoleServiceDb(): ConsoleDb {
  if (typeof window !== "undefined") throw new Error("The console service client must never run in the browser.");
  const key = env().SUPABASE_SECRET_KEY;
  if (!key || !isSupabaseConfigured()) throw unavailable();
  return createClient<Database>(supabasePublicEnv.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
