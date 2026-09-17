import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";
import { isSupabaseConfigured, supabasePublicEnv } from "./public-env";

export type Db = SupabaseClient<Database>;

/** Cookie-bound server client for route handlers and server components. Null when accounts are not configured. */
export async function createServerSupabase(): Promise<Db | null> {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient<Database>(supabasePublicEnv.url, supabasePublicEnv.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component render: cookies are read-only there and
          // src/proxy.ts refreshes the session on the next request instead.
        }
      },
    },
  });
}
