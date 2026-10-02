import { AppError } from "@/services/errors";
import { createAdminSupabase } from "@/services/supabase/admin";

// What the send runner READS and the one transition it owns, beside the six writes in store.ts.
// The schema is private, so each is a security-definer function exactly as those are.
//
// Same rule as store.ts: a database error THROWS, and an answer of the wrong shape throws too. The
// runner acts on every one of these, and a failure read as "no letters", "not stopped" or "nothing
// left" would respectively send nothing, keep sending past a Stop, or finish a letter early.
// Nothing here logs. An error carries the RPC's name and never an address, a signature or a person id.

type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

// Cast for the same reason as store.ts: the generated types carry no announce_* signatures until
// `supabase gen types` is re-run against a database that has the migration.
const call: Rpc = (name, args) => (createAdminSupabase() as unknown as { rpc: Rpc }).rpc(name, args);

const failed = (name: string): AppError =>
  new AppError("SOURCE_UNAVAILABLE", `The announcements store could not complete ${name}.`);

export type LetterState = "draft" | "queued" | "sending" | "stopped" | "done";
export type OpenLetter = {
  readonly id: string;
  readonly list: "news" | "availability";
  readonly subject: string;
  readonly body: string;
  readonly state: "queued" | "sending";
  readonly queuedAt: string;
};
export type OpenClaim = { readonly personId: string; readonly claimedAt: string };
export type Remaining = { readonly pending: number; readonly sending: number };

const STATES: readonly string[] = ["draft", "queued", "sending", "stopped", "done"];

const record = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function asOpenLetter(row: unknown): OpenLetter | null {
  const r = record(row);
  if (!r) return null;
  const { id, list, subject, body, state, queuedAt } = r;
  if (!nonEmpty(id) || !nonEmpty(subject) || !nonEmpty(body) || !nonEmpty(queuedAt)) return null;
  if (list !== "news" && list !== "availability") return null;
  if (state !== "queued" && state !== "sending") return null;
  return { id, list, subject, body, state, queuedAt };
}

/**
 * Every letter that is queued or sending, in no promised order: choosing among them is the runner's
 * decision and lives in `announce-plan.mjs`. A row of the wrong shape throws rather than being
 * dropped, because a dropped letter is one that is silently never sent.
 */
export async function openLetters(): Promise<readonly OpenLetter[]> {
  const { data, error } = await call("announce_open_letters", {});
  if (error || !Array.isArray(data)) throw failed("announce_open_letters");
  return data.map((row) => {
    const letter = asOpenLetter(row);
    if (!letter) throw failed("announce_open_letters");
    return letter;
  });
}

/** The letter's state now, or null when there is no such letter. Read before each batch and each send, so Stop is immediate. */
export async function letterState(id: string): Promise<LetterState | null> {
  const { data, error } = await call("announce_letter_state", { p_letter: id });
  if (error) throw failed("announce_letter_state");
  if (data === null) return null;
  if (typeof data !== "string" || !STATES.includes(data)) throw failed("announce_letter_state");
  return data as LetterState;
}

/** Every delivery of the letter still claimed (`sending`), with when it was claimed. */
export async function openClaims(id: string): Promise<readonly OpenClaim[]> {
  const { data, error } = await call("announce_open_claims", { p_letter: id });
  if (error || !Array.isArray(data)) throw failed("announce_open_claims");
  return data.map((row) => {
    const r = record(row);
    if (!r || !nonEmpty(r.personId) || !nonEmpty(r.claimedAt)) throw failed("announce_open_claims");
    return { personId: r.personId, claimedAt: r.claimedAt };
  });
}

/** How many deliveries are still `pending` and how many are `sending` (claimed, awaiting a retry or a mark). */
export async function remainingFor(id: string): Promise<Remaining> {
  const { data, error } = await call("announce_remaining", { p_letter: id });
  const r = record(data);
  if (error || !r || !count(r.pending) || !count(r.sending)) throw failed("announce_remaining");
  return { pending: r.pending, sending: r.sending };
}

/** Marks the letter done. The database refuses to move a stopped letter, so a Stop that landed mid-run stays a Stop. */
export async function finishLetter(id: string): Promise<void> {
  const { error } = await call("announce_finish", { p_letter: id });
  if (error) throw failed("announce_finish");
}
