// Previews and local servers use the production Supabase project, so the console would act on real data there.
// It runs in production, or locally against a local database (or none, when there is nothing to act on).

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
