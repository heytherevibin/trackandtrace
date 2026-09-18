import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { isSupabaseConfigured, supabasePublicEnv } from "./public-env";

let client: SupabaseClient<Database> | null = null;

/** Browser client used for sign-in and sign-out only; data access stays server-side. */
export function createBrowserSupabase(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null;
  client ??= createBrowserClient<Database>(supabasePublicEnv.url, supabasePublicEnv.publishableKey, {
    // Passkeys (WebAuthn) are behind an experimental flag in auth-js; without it every passkey call throws.
    auth: { experimental: { passkey: true } },
  });
  return client;
}
