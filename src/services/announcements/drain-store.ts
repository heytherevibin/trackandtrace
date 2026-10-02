import { AppError } from "@/services/errors";
import { log } from "@/services/log";
import { createAdminSupabase } from "@/services/supabase/admin";

// What the send runner READS and the one transition it owns, beside the six writes in store.ts.
// The schema is private, so each is a security-definer function exactly as those are.
//
// Same rule as store.ts: a database error THROWS, and an answer of the wrong shape throws too. The
// runner acts on every one of these, and a failure read as "no letters", "not stopped" or "nothing
// left" would respectively send nothing, keep sending past a Stop, or finish a letter early. The one
// exception is a single malformed LETTER in `openLetters`, which is skipped and named in the log: see
// there. Nothing else logs. An error carries the RPC's name and never an address, a signature or a
// person id.
//
// ---------------------------------------------------------------------------
// THIS FILE IS THE MIGRATION'S SPECIFICATION for the functions it calls. The migration is written to
// match it, so what is only implied by a destructuring line below is stated here.
// ---------------------------------------------------------------------------
//   * KEYS ARE CAMELCASE. Each function returns jsonb built with `jsonb_build_object('personId', …)`,
//     the way `announce_claim` does: `personId`, `claimedAt`, `firstAttemptedAt`, `queuedAt`. A
//     snake_case key reads as a missing field.
//   * `announce_open_letters()`   setof jsonb {id, list, subject, body, state, queuedAt}, for letters
//                                 whose state is `queued` or `sending`.
//   * `announce_letter_state(p_letter uuid)`  text, null when there is no such letter.
//   * `announce_open_claims(p_letter uuid)`   setof jsonb {personId, claimedAt, firstAttemptedAt,
//                                 state} for every delivery that is NOT SETTLED, which is `sending`
//                                 or `unknown`. Both are returned and each says which it is: the
//                                 stuck report has a rule for "any unknown at all", and with only
//                                 `sending` rows that rule passes its own tests and reads nothing.
//   * `announce_remaining(p_letter uuid)`     jsonb {pending, sending, lastSentAt}. The counts are
//                                 whole numbers; `lastSentAt` is the LATEST `sent_at` among this
//                                 letter's sent deliveries, or null when it has never sent one.
//                                 Null is "has never sent", which the report measures from
//                                 `queuedAt` instead — never from the epoch.
//   * `announce_finish(p_letter uuid)`        void: `done` and `finished_at = now()` only from
//                                 `queued` or `sending`, so a Stop that landed mid-run stays a Stop,
//                                 and only while NO delivery is `unknown`. An unknown letter stays
//                                 open on purpose, so the stuck report names it every day until a
//                                 human settles that row: `unknown` means we cannot say whether
//                                 that person received the letter, so we do not know it is done.
//   * THE TRANSITION `queued` -> `sending` HAPPENS IN `announce_claim`, on the first claim of a
//     letter. Nothing in the runner writes it, and `announce_open_letters` returns both states.
//   * TWO TIMESTAMPS ON A DELIVERY, with different jobs. `claimed_at` is set on EVERY claim, a
//     re-claim included, and drives the claim's 15-minute re-claim floor. `first_attempted_at` is set
//     once, by the first claim, never touched by a re-claim, and is what the 24-hour idempotency
//     window is measured from. The claim's 24-hour ceiling is on `first_attempted_at`, not
//     `claimed_at`: Resend's memory of a key starts at the first attempt and a re-claim does not
//     renew it. Both columns come back from `announce_open_claims`.

type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

// Cast for the same reason as store.ts, and permanently: `gen types` cannot express RPC nullability,
// so `announce_open_letters` is generated as `Args: never` and `announce_letter_state` as returning
// `string` though answering null is half its job. The argument names are pinned by the pgTAP suite's
// named notation instead.
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
/** Not settled: `sending` is claimed and awaiting a mark, `unknown` is an outcome we cannot state. */
export type ClaimState = "sending" | "unknown";
export type OpenClaim = {
  readonly personId: string;
  /**
   * The latest claim, a re-claim included. The claim's 15-minute floor reads this.
   *
   * Null for a row nobody claimed — which is what an operator settling a stuck delivery by hand
   * writes, exactly as the runbook tells them to. Throwing on it would make one hand-written row
   * fail every read of that letter for ever.
   */
  readonly claimedAt: string | null;
  /** The first claim, never moved. The 24-hour window reads this; null means unknown, which the runner treats as stale. */
  readonly firstAttemptedAt: string | null;
  /** Which kind of unsettled this is. The report's unknown rule reads it, and reads nothing without it. */
  readonly state: ClaimState;
};
export type Remaining = {
  readonly pending: number;
  readonly sending: number;
  /** The latest delivery this letter actually sent, or null when it has never sent one. */
  readonly lastSentAt: string | null;
};

const STATES: readonly string[] = ["draft", "queued", "sending", "stopped", "done"];

const record = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

function asOpenLetter(row: unknown): OpenLetter | null {
  const r = record(row);
  if (!r) return null;
  const { id, list, subject, body, state, queuedAt } = r;
  if (!nonEmpty(id) || !nonEmpty(subject) || !nonEmpty(body) || !nonEmpty(queuedAt) || Number.isNaN(Date.parse(queuedAt))) return null;
  if (list !== "news" && list !== "availability") return null;
  if (state !== "queued" && state !== "sending") return null;
  return { id, list, subject, body, state, queuedAt };
}

/**
 * Every letter that is queued or sending, in no promised order: choosing among them is the runner's
 * decision and lives in `announce-plan.mjs`.
 *
 * A letter of the wrong shape is SKIPPED and named in the log, and the rest are returned. Throwing
 * would let one row nothing guarantees against — a `queued` letter whose `queued_at` is null — stop
 * every announcement for good. The skipped one is not sent until someone fixes it, which is why it
 * is logged on every run; its id is a uuid, not an address. An answer that is not a list at all is
 * the store failing, and still throws.
 */
export async function openLetters(): Promise<readonly OpenLetter[]> {
  const { data, error } = await call("announce_open_letters", {});
  if (error || !Array.isArray(data)) throw failed("announce_open_letters");
  const letters: OpenLetter[] = [];
  for (const row of data) {
    const letter = asOpenLetter(row);
    if (letter) letters.push(letter);
    else log.warn(`[announce] skipped a malformed letter and drained the rest: ${nonEmpty(record(row)?.id) ? String(record(row)?.id) : "no id"}`);
  }
  return letters;
}

/** The letter's state now, or null when there is no such letter. Read before each batch and each send, so Stop is immediate. */
export async function letterState(id: string): Promise<LetterState | null> {
  const { data, error } = await call("announce_letter_state", { p_letter: id });
  if (error) throw failed("announce_letter_state");
  if (data === null) return null;
  if (typeof data !== "string" || !STATES.includes(data)) throw failed("announce_letter_state");
  return data as LetterState;
}

/** Every delivery of the letter that is not settled — `sending` or `unknown` — and which it is. */
export async function openClaims(id: string): Promise<readonly OpenClaim[]> {
  const { data, error } = await call("announce_open_claims", { p_letter: id });
  if (error || !Array.isArray(data)) throw failed("announce_open_claims");
  return data.map((row) => {
    const r = record(row);
    if (!r || !nonEmpty(r.personId)) throw failed("announce_open_claims");
    // Absent or null is "never recorded" for BOTH times, not a failed read: the runner counts an
    // absent first attempt stale, which is the side that never sends twice, and a hand-settled row
    // may carry no claim time at all. Anything else that is not a string is a wrong answer.
    const claimed = r.claimedAt ?? null;
    if (claimed !== null && typeof claimed !== "string") throw failed("announce_open_claims");
    const first = r.firstAttemptedAt ?? null;
    if (first !== null && typeof first !== "string") throw failed("announce_open_claims");
    // The state is ACTED ON — `unknown` is what the report names and `sending` is what the claim
    // may retry — so an unrecognised one is the store answering wrongly, not a row to guess at.
    if (r.state !== "sending" && r.state !== "unknown") throw failed("announce_open_claims");
    return { personId: r.personId, claimedAt: claimed, firstAttemptedAt: first, state: r.state };
  });
}

/**
 * How many deliveries are still `pending`, how many are `sending` (claimed, awaiting a retry or a
 * mark), and when this letter last actually sent one.
 *
 * Every field read off the answer must also be COPIED INTO the returned object. A field produced by
 * the database and dropped here is invisible to everything above, and the check that depends on it
 * goes on passing while measuring something else: that is exactly how `lastSentAt` came to be
 * computed by the store, discarded here, and read as "has never sent" for ever.
 */
export async function remainingFor(id: string): Promise<Remaining> {
  const { data, error } = await call("announce_remaining", { p_letter: id });
  const r = record(data);
  if (error || !r || !count(r.pending) || !count(r.sending)) throw failed("announce_remaining");
  // Absent and null alike are "has never sent", which the report measures from `queuedAt` instead.
  // Anything else that is not a string is a wrong answer.
  const lastSentAt = r.lastSentAt ?? null;
  if (lastSentAt !== null && typeof lastSentAt !== "string") throw failed("announce_remaining");
  return { pending: r.pending, sending: r.sending, lastSentAt };
}

/** Marks the letter done. The database refuses to move a stopped letter, so a Stop that landed mid-run stays a Stop. */
export async function finishLetter(id: string): Promise<void> {
  const { error } = await call("announce_finish", { p_letter: id });
  if (error) throw failed("announce_finish");
}
