import { messages } from "@/messages";
import { AppError } from "@/services/errors";
import { createAdminSupabase } from "@/services/supabase/admin";
import type { SubscribeAsk } from "./subscribe";

// The six RPCs, one small function each. Nothing here reads a table: the schema is private and only
// these security-definer functions can reach it. A database error is the traveller's "didn't go
// through" — they never learn which of the steps it was.

const failed = (): AppError => new AppError("SOURCE_UNAVAILABLE", messages.subscribe.errors.failed);

/** `bytea` travels through PostgREST as a `\x`-prefixed hex string, not as bytes. */
const hex = (b: Buffer): string => `\\x${b.toString("hex")}`;

export async function signUpRow(ask: SubscribeAsk, tokenHash: Buffer): Promise<"send" | "quiet"> {
  const { data, error } = await createAdminSupabase().rpc("subscriptions_sign_up", {
    p_email: ask.email,
    p_list: ask.list,
    p_source: ask.source,
    p_campaign: ask.campaign ?? null,
    p_notice_version: "1.1",
    p_token_hash: hex(tokenHash),
  });
  if (error || (data !== "send" && data !== "quiet")) throw failed();
  return data;
}

export async function confirmRow(tokenHash: Buffer): Promise<{ readonly state: string; readonly list: string | null }> {
  const { data, error } = await createAdminSupabase().rpc("subscriptions_confirm", { p_token_hash: hex(tokenHash) });
  if (error || typeof data !== "object" || data === null) throw failed();
  return data as { state: string; list: string | null };
}

export async function peekRow(tokenHash: Buffer): Promise<{ readonly state: string; readonly list: string | null }> {
  const { data, error } = await createAdminSupabase().rpc("subscriptions_peek", { p_token_hash: hex(tokenHash) });
  if (error || typeof data !== "object" || data === null) throw failed();
  return data as { state: string; list: string | null };
}

export async function withdrawRow(person: string, list: string, reason: string | null): Promise<string> {
  const { data, error } = await createAdminSupabase().rpc("subscriptions_withdraw", {
    p_person: person,
    p_list: list,
    // `supabase gen types` never marks an RPC argument nullable — not once in the 45 signatures it
    // generates — though `p_reason text` takes null, and a plain unsubscribe passes one: the reason
    // is optional and may be added afterwards. The pgTAP suite covers both paths.
    p_reason: reason as string,
  });
  if (error || typeof data !== "string") throw failed();
  return data;
}

export async function rejoinRow(person: string, list: string): Promise<string> {
  const { data, error } = await createAdminSupabase().rpc("subscriptions_rejoin", { p_person: person, p_list: list });
  if (error || typeof data !== "string") throw failed();
  return data;
}

export async function personId(email: string): Promise<string | null> {
  const { data, error } = await createAdminSupabase().rpc("subscriptions_person_id", { p_email: email });
  if (error) throw failed();
  return typeof data === "string" ? data : null;
}
