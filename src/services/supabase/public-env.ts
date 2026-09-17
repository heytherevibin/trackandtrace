// Client-safe Supabase settings. Literal NEXT_PUBLIC_ reads let Next inline them.
export const supabasePublicEnv = {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
} as const;

export function isSupabaseConfigured(): boolean {
  return supabasePublicEnv.url.length > 0 && supabasePublicEnv.anonKey.length > 0;
}
