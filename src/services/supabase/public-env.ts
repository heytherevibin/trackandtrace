// Client-safe Supabase settings. Literal NEXT_PUBLIC_ reads let Next inline them.
export const supabasePublicEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
} as const;

export function isSupabaseConfigured(): boolean {
  return supabasePublicEnv.url.length > 0 && supabasePublicEnv.publishableKey.length > 0;
}
