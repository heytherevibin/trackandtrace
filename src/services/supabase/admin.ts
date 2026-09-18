import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/services/env";
import { AppError } from "@/services/errors";
import type { Database } from "@/types/supabase";
import { isSupabaseConfigured, supabasePublicEnv } from "./public-env";

/** Secret-key client (bypasses RLS). Server only, used solely to delete an account. Never import from client code. */
export function createAdminSupabase(): SupabaseClient<Database> {
  if (typeof window !== "undefined") throw new Error("The admin Supabase client must never run in the browser.");
  const key = env().SUPABASE_SECRET_KEY;
  if (!key || !isSupabaseConfigured()) {
    throw new AppError("SOURCE_UNAVAILABLE", "Account deletion is not configured for this deployment.");
  }
  return createClient<Database>(supabasePublicEnv.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
