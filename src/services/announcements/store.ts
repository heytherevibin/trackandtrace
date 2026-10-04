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

// The cast is permanent, and not a placeholder. `supabase gen types` models an RPC's arguments and
// return as non-nullable, so the generated signatures contradict these functions in ways no amount of
// regeneration fixes: `announce_open_letters` comes out as `Args: never`, `announce_mark`'s
// `p_provider_id` as a required string though a send with no provider id passes null, and
// `announce_letter_state` and `announce_suppressed` as `string` though both answer null — which is
// the whole point of two of them. The argument NAMES are pinned instead by the pgTAP suite, which
// calls every function with named notation (`p_letter => …`), because names are what PostgREST
// resolves on and a rename would otherwise answer PGRST202 on the first real call.
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

/**
 * Moves a letter to queued and makes one pending delivery per subscriber. Returns how many.
 *
 * The database refuses a letter that is not a draft, and one nobody has test sent: a proof is the
 * last point at which a mistake costs nothing. `memberId` is recorded as `queued_by`.
 */
export async function queueLetter(id: string, memberId: string): Promise<number> {
  const { data, error } = await call("announce_queue", { p_letter: id, p_member: memberId });
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

/** Halts the rest of a letter. `memberId` is recorded as `stopped_by`, which the console names. */
export async function stopLetter(id: string, memberId: string): Promise<void> {
  const { error } = await call("announce_stop", { p_letter: id, p_member: memberId });
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
