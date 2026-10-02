import { AppError } from "@/services/errors";
import { createAdminSupabase } from "@/services/supabase/admin";

// The six announcements RPCs, one small function each. Nothing here reads a table: the schema is
// private and only these security-definer functions can reach it.
//
// A database error THROWS. A caller must never be able to mistake a failure for an empty result: a
// send loop that read "the database is down" as "no recipients left" would report a clean run having
// sent nothing. The same goes for an answer of the wrong shape on anything that is acted on.
//
// Nothing here logs. An error carries the RPC's name and never an address, a signature or a person id.

type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

// `src/types/supabase.ts` has no announce_* signatures until `supabase gen types` is re-run against a
// database that has the migration applied, so the generated client rejects these names at compile
// time. This is the one place that says so; once the types carry them, delete the cast and let the
// compiler check the argument names the pgTAP suite already pins.
const call: Rpc = (name, args) => (createAdminSupabase() as unknown as { rpc: Rpc }).rpc(name, args);

const failed = (name: string): AppError =>
  new AppError("SOURCE_UNAVAILABLE", `The announcements store could not complete ${name}.`);

export type Claimed = { readonly personId: string; readonly email: string };
export type DeliveryOutcome = "sent" | "unknown" | "skipped";

const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;

// Both fields, non-empty: an empty address is a send to nothing, and would travel all the way to the
// sender before failing there.
const isClaimed = (row: unknown): row is Claimed =>
  typeof row === "object" &&
  row !== null &&
  nonEmpty((row as Record<string, unknown>).personId) &&
  nonEmpty((row as Record<string, unknown>).email);

/** Moves a letter to queued and makes one pending delivery per subscriber. Returns how many. */
export async function queueLetter(id: string): Promise<number> {
  const { data, error } = await call("announce_queue", { p_letter: id });
  if (error || typeof data !== "number") throw failed("announce_queue");
  return data;
}

/**
 * Atomically claims up to `limit` deliveries (`for update skip locked`, so two concurrent runs never
 * take the same row). Returns the claimed rows, not a count. A row of the wrong shape throws rather
 * than being dropped: a dropped row is a recipient silently never sent to.
 */
export async function claimDeliveries(letterId: string, limit: number): Promise<readonly Claimed[]> {
  const { data, error } = await call("announce_claim", { p_letter: letterId, p_limit: limit });
  if (error || !Array.isArray(data) || !data.every(isClaimed)) throw failed("announce_claim");
  return data.map((r) => ({ personId: r.personId, email: r.email }));
}

export async function markDelivery(
  letterId: string,
  personId: string,
  state: DeliveryOutcome,
  providerId: string | null,
): Promise<void> {
  const { error } = await call("announce_mark", {
    p_letter: letterId,
    p_person: personId,
    p_state: state,
    p_provider_id: providerId,
  });
  if (error) throw failed("announce_mark");
}

export async function stopLetter(id: string): Promise<void> {
  const { error } = await call("announce_stop", { p_letter: id });
  if (error) throw failed("announce_stop");
}

/**
 * Whether the address is suppressed, and how widely. Anything that is not exactly "all" or "list" is
 * null: for a read, an unrecognised answer is safer treated as not suppressed than guessed at. An
 * error still throws, because "could not tell" is not "not suppressed".
 */
export async function suppressionFor(email: string): Promise<"all" | "list" | null> {
  const { data, error } = await call("announce_suppressed", { p_email: email });
  if (error) throw failed("announce_suppressed");
  return data === "all" || data === "list" ? data : null;
}

/** Records one Resend event once. A replayed `svixId` answers "duplicate" and changes nothing. */
export async function recordWebhook(
  svixId: string,
  kind: string,
  email: string,
  at: string,
): Promise<"recorded" | "duplicate"> {
  const { data, error } = await call("announce_webhook", {
    p_svix_id: svixId,
    p_kind: kind,
    p_email: email,
    p_at: at,
  });
  if (error || (data !== "recorded" && data !== "duplicate")) throw failed("announce_webhook");
  return data;
}
