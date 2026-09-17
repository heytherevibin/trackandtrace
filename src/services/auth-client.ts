import { createBrowserSupabase } from "./supabase/browser";

// Browser-side sign-in helpers. Data never flows through the browser client;
// it only starts and ends sessions.

export type AuthClientResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

const NOT_CONFIGURED = "Sign-in is not connected on this deployment.";

export function callbackUrl(next = "/account"): string {
  return `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function sendMagicLink(email: string, next?: string): Promise<AuthClientResult> {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: callbackUrl(next), shouldCreateUser: true },
  });
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function signInWithGoogle(next?: string): Promise<AuthClientResult> {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl(next) } });
  return error ? { ok: false, message: error.message } : { ok: true };
}

/** Ends the browser session and the cookie session. Callers navigate afterwards. */
export async function signOutEverywhere(): Promise<void> {
  const supabase = createBrowserSupabase();
  if (supabase) await supabase.auth.signOut();
  await fetch("/auth/signout", { method: "POST", redirect: "manual" }).catch(() => undefined);
}
