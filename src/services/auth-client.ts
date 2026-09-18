import { createBrowserSupabase } from "./supabase/browser";

// Browser-side sign-in helpers. Data never flows through the browser client;
// it only starts and ends sessions.

export type AuthClientResult = { readonly ok: true } | { readonly ok: false; readonly message: string };
/** A passkey result carries no message when the reader simply dismissed the device prompt. */
export type PasskeyResult = { readonly ok: true } | { readonly ok: false; readonly message: string | null };

export interface PasskeyRecord {
  readonly id: string;
  readonly name: string | null;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
}

const NOT_CONFIGURED = "Sign-in is not connected on this deployment.";
const PASSKEY_MESSAGES: Readonly<Record<string, string | null>> = {
  ERROR_CEREMONY_ABORTED: null,
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: "This device already has a passkey for your account.",
  ERROR_INVALID_DOMAIN: "Passkeys need a secure address (https, or localhost).",
};

/** The error as a line to show, or null when the reader dismissed the prompt themselves. */
function passkeyMessage(error: unknown): string | null {
  const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code in PASSKEY_MESSAGES) return PASSKEY_MESSAGES[code] ?? null;
  return error instanceof Error && error.message.length > 0 ? error.message : "That passkey did not work.";
}

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

/** Whether this browser can do the WebAuthn ceremony at all. */
export function passkeysUsable(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";
}

/** Signs in with a passkey: the device prompt, then a session in the cookie. Callers navigate afterwards. */
export async function signInWithPasskey(): Promise<PasskeyResult> {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { error } = await supabase.auth.signInWithPasskey();
  return error ? { ok: false, message: passkeyMessage(error) } : { ok: true };
}

/** Registers a passkey for the signed-in reader on the device in front of them. */
export async function registerPasskey(): Promise<PasskeyResult> {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { error } = await supabase.auth.registerPasskey();
  return error ? { ok: false, message: passkeyMessage(error) } : { ok: true };
}

/** The reader's registered passkeys, newest first. An unreadable answer lists none rather than guessing. */
export async function listPasskeys(): Promise<readonly PasskeyRecord[]> {
  const supabase = createBrowserSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.auth.passkey.list();
  if (error || !data) return [];
  return data.map((item) => ({
    id: item.id,
    name: item.friendly_name ?? null,
    createdAt: item.created_at,
    lastUsedAt: item.last_used_at ?? null,
  }));
}

export async function deletePasskey(passkeyId: string): Promise<PasskeyResult> {
  const supabase = createBrowserSupabase();
  if (!supabase) return { ok: false, message: NOT_CONFIGURED };
  const { error } = await supabase.auth.passkey.delete({ passkeyId });
  return error ? { ok: false, message: passkeyMessage(error) } : { ok: true };
}

/** Ends the browser session and the cookie session. Callers navigate afterwards. */
export async function signOutEverywhere(): Promise<void> {
  const supabase = createBrowserSupabase();
  if (supabase) await supabase.auth.signOut();
  await fetch("/auth/signout", { method: "POST", redirect: "manual" }).catch(() => undefined);
}
