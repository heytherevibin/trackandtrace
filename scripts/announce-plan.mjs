// The announcement runner's decisions, and the loop that walks them.
//
// Everything here is pure — no network, no database, no clock beyond the one it is handed — and the
// world (the store, the day's counter, the mail door) is INJECTED, so every decision below is tested
// without any of them. `announce-send.mjs` wires the real ones and is the only file that touches
// the world, exactly as `crawl-availability.mjs` stands to `crawl-plan.mjs`.
//
// ---------------------------------------------------------------------------
// WHAT IS DECIDED HERE. Each of these was ruled on before this was written; none is open.
// ---------------------------------------------------------------------------
//   1. ONE LETTER DRAINS AT A TIME, in queue order. `pickLetter` takes the OLDEST `queued_at` that is
//      queued or sending and the run finishes it before another is touched. Interleaving makes both
//      letters slow and neither predictable; one at a time is what lets the console say "this
//      finishes about X, then the next begins" and have it be true.
//   2. STALE CLAIMS BECOME `unknown` FIRST. A row claimed more than 24 hours ago can never be retried
//      safely — 24 hours is Resend's idempotency window, past which a repeat may duplicate — so it
//      is marked `unknown` and never touched again. THIS RUN IS THE ONLY WRITER OF `unknown`:
//      nothing else moves those rows, and a row left `sending` forever makes a finished letter look
//      permanently in flight.
//   3. `suppressed` IS A SKIP, never a failure. The row is marked `skipped`. Retrying a suppressed
//      address every day forever would spend the day's budget on mail that will never go.
//   4. A `failed` SEND LEAVES THE ROW `sending`, unmarked, for the next run to retry inside the
//      24-hour window under the same idempotency key. A failure says nothing about the address.
//   5. THE LIST-UNSUBSCRIBE HEADER POINTS AT `/api/unsubscribe/one-click`, with `p`, `l` and `s` in
//      the query — NOT at the human `/unsubscribe` page, which is a GET and answers 405 to a mail
//      client's one-click POST. `listHeaders` deliberately does not check this; `composeMail` owns
//      it. The message BODY's link still points at the human page.
//   6. THE LETTER'S STATE IS READ BEFORE EACH BATCH AND BEFORE EACH SEND, so a Stop takes effect at
//      the next recipient and not at the end of a batch of forty.
//
// Also decided here, and worth knowing: a letter is `done` only when nothing is pending AND nothing
// is still `sending`. A failed row waiting for its retry is not finished mail.
//
// WHAT THIS CANNOT SEE. It never learns whether a `sent` message was delivered: that is the webhook's
// business, not the runner's. A send whose mark then failed is left `sending` and retried under the
// same key, which is safe inside the window and is `unknown` after it. And it does not refund the
// day's allowance for rows it reserved and then did not claim: it errs towards sending less.
// ---------------------------------------------------------------------------

/** Resend remembers an idempotency key for 24 hours; past that a repeat may send twice. */
export const IDEMPOTENCY_WINDOW_MS = 24 * 3_600_000;

/** The most one reservation asks for. The budget clamps to the same number; this keeps the ask honest. */
export const BATCH_MAX = 40;

/** A guard on the loop, not a rule: the day's counter ends the run long before this does. */
const BATCHES_MAX = 50;

/**
 * @typedef {{ id: string, list: "news" | "availability", subject: string, body: string, state: string, queuedAt: string }} OpenLetter
 * @typedef {{ personId: string, claimedAt: string }} OpenClaim
 */

/**
 * How many to claim now: what the day allows, never more than is waiting, never negative.
 * Zero is a normal outcome — a spent day sends nothing and says so.
 *
 * @param {{ budget: number, pending: number }} input
 * @returns {number}
 */
export function nextBatch({ budget, pending }) {
  if (!Number.isFinite(budget) || !Number.isFinite(pending)) return 0;
  return Math.max(0, Math.floor(Math.min(budget, pending)));
}

/**
 * The people whose rows were claimed more than 24 hours ago.
 *
 * A date that cannot be read is stale: a claim we cannot date cannot be shown to be inside the
 * window, and `unknown` is the side that never sends twice.
 *
 * @param {readonly OpenClaim[]} rows
 * @param {Date} at
 * @returns {string[]}
 */
export function staleClaims(rows, at) {
  return rows
    .filter((row) => {
      const claimed = Date.parse(row.claimedAt);
      return Number.isNaN(claimed) || at.getTime() - claimed > IDEMPOTENCY_WINDOW_MS;
    })
    .map((row) => row.personId);
}

/**
 * The letter to drain: the OLDEST `queuedAt` among those queued or sending, or null.
 * A draft was never queued, and a done or stopped letter is final.
 *
 * @param {readonly OpenLetter[]} letters
 * @returns {OpenLetter | null}
 */
export function pickLetter(letters) {
  const open = letters.filter((l) => l.state === "queued" || l.state === "sending");
  if (open.length === 0) return null;
  return open.reduce((oldest, l) => (Date.parse(l.queuedAt) < Date.parse(oldest.queuedAt) ? l : oldest));
}

/** Whether a letter in this state may still be sent. Anything else — stopped, done, gone — is a Stop. */
export function mayContinue(state) {
  return state === "queued" || state === "sending";
}

/**
 * What one send's outcome does to its row. `mark: null` means leave it alone.
 *
 * Anything this does not recognise is a failure: an unknown answer must never mark a row sent, and
 * must never mark it skipped either.
 *
 * @param {{ outcome?: string, id?: string } | null | undefined} result
 * @returns {{ mark: "sent" | "skipped" | null, providerId: string | null, reason?: string, counts: "sent" | "skipped" | "failed" }}
 */
export function deliveryVerdict(result) {
  switch (result?.outcome) {
    case "sent":
      return { mark: "sent", providerId: typeof result.id === "string" ? result.id : null, counts: "sent" };
    // The E2E outbox: captured, never sent. It is "sent" for the row so a local run can finish a letter.
    case "captured":
      return { mark: "sent", providerId: null, counts: "sent" };
    case "suppressed":
      return { mark: "skipped", providerId: null, reason: "suppressed", counts: "skipped" };
    default:
      return { mark: null, providerId: null, counts: "failed" };
  }
}

/** The one-click POST endpoint: what `List-Unsubscribe-Post` promises and the human page cannot answer. */
export function oneClickUrl(origin, person, list, signature) {
  return `${origin}/api/unsubscribe/one-click?p=${person}&l=${list}&s=${signature}`;
}

/**
 * One recipient's message. The body carries the HUMAN page's link; the header carries the one-click
 * endpoint's. They are different URLs on purpose, and swapping them passes every other check.
 *
 * @param {{
 *   letter: OpenLetter, personId: string, email: string, origin: string, from: string,
 *   sign: (person: string, list: string) => string,
 *   deps: {
 *     letterText: (body: string, humanUrl: string, list: "news" | "availability") => string,
 *     listHeaders: (oneClickUrl: string) => Record<string, string>,
 *     unsubscribeUrl: (origin: string, person: string, list: string, signature: string) => string,
 *   },
 * }} input
 */
export function composeMail({ letter, personId, email, origin, from, sign, deps }) {
  const signature = sign(personId, letter.list);
  return {
    from,
    to: email,
    subject: letter.subject,
    text: deps.letterText(letter.body, deps.unsubscribeUrl(origin, personId, letter.list, signature), letter.list),
    headers: deps.listHeaders(oneClickUrl(origin, personId, letter.list, signature)),
  };
}

/**
 * One run: pick the letter, settle stale claims, then claim and send what the day allows.
 *
 * Throws when the store does (a database that cannot answer must stop the run, not be read as an
 * empty answer); never throws for a send, which the door already turns into an outcome. It prints
 * counts and the letter's id and nothing else: no address, no signature, no subject.
 *
 * @param {{
 *   deps: Parameters<typeof composeMail>[0]["deps"],
 *   sign: (person: string, list: string) => string,
 *   now: () => Date,
 *   say: (line: string) => void,
 *   openLetters: () => Promise<readonly OpenLetter[]>,
 *   stateOf: (id: string) => Promise<string | null>,
 *   openClaims: (id: string) => Promise<readonly OpenClaim[]>,
 *   remaining: (id: string) => Promise<{ pending: number, sending: number }>,
 *   take: (want: number) => Promise<number>,
 *   claim: (id: string, n: number) => Promise<readonly { personId: string, email: string }[]>,
 *   mark: (id: string, person: string, state: "sent" | "unknown" | "skipped", providerId: string | null) => Promise<void>,
 *   finish: (id: string) => Promise<void>,
 *   send: (mail: ReturnType<typeof composeMail>, kind: "list", key: string) => Promise<{ outcome?: string, id?: string }>,
 * }} world
 * @param {{ origin: string, from: string }} options
 */
export async function drain(world, { origin, from }) {
  const summary = { letterId: null, stale: 0, claimed: 0, sent: 0, skipped: 0, failed: 0, stopped: false, finished: false, budgetSpent: false };
  const letter = pickLetter(await world.openLetters());
  if (!letter) {
    world.say("[announce] no letter is queued, so there is nothing to send.");
    return summary;
  }
  summary.letterId = letter.id;
  world.say(`[announce] letter ${letter.id} (${letter.list} list) is the oldest open one.`);

  // Before anything is claimed: see decision 2.
  for (const personId of staleClaims(await world.openClaims(letter.id), world.now())) {
    await world.mark(letter.id, personId, "unknown", null);
    summary.stale += 1;
  }
  if (summary.stale > 0) world.say(`[announce] ${summary.stale} claimed over 24 hours ago, so ${summary.stale === 1 ? "it is" : "they are"} now unknown and will not be retried.`);

  let first = true;
  for (let batch = 0; batch < BATCHES_MAX; batch += 1) {
    // Decision 6, the first half: a Stop that landed since the last batch ends the run before it spends a thing.
    if (!mayContinue(await world.stateOf(letter.id))) {
      summary.stopped = true;
      break;
    }
    const left = await world.remaining(letter.id);
    if (left.pending + left.sending === 0) {
      await world.finish(letter.id);
      summary.finished = true;
      break;
    }
    // The first batch may also retry rows a previous run left `sending`. After it, only `pending`
    // can be claimed: a row this run just failed is inside the claim's 15-minute floor, and asking
    // the day's counter for it would spend allowance on a claim that returns nothing.
    const claimable = first ? left.pending + left.sending : left.pending;
    first = false;
    if (claimable === 0) break;
    const want = Math.min(claimable, BATCH_MAX);
    const budget = await world.take(want);
    const n = nextBatch({ budget, pending: want });
    if (n === 0) {
      summary.budgetSpent = true;
      break;
    }
    const rows = await world.claim(letter.id, n);
    summary.claimed += rows.length;
    if (rows.length === 0) break;

    for (const row of rows) {
      // Decision 6, the second half: read again before THIS recipient, so a Stop is not a batch late.
      if (!mayContinue(await world.stateOf(letter.id))) {
        summary.stopped = true;
        break;
      }
      const mail = composeMail({ letter, personId: row.personId, email: row.email, origin, from, sign: world.sign, deps: world.deps });
      const verdict = deliveryVerdict(await world.send(mail, "list", `${letter.id}:${row.personId}`));
      summary[verdict.counts] += 1;
      if (verdict.mark) await world.mark(letter.id, row.personId, verdict.mark, verdict.providerId);
    }
    if (summary.stopped) break;
    if (budget < want) {
      summary.budgetSpent = true;
      break;
    }
  }

  world.say(`[announce] sent ${summary.sent}, skipped ${summary.skipped} (suppressed), failed ${summary.failed}${summary.failed > 0 ? " (left to retry within 24 hours)" : ""}.`);
  if (summary.stopped) world.say("[announce] the letter was stopped, so nothing more was sent.");
  if (summary.budgetSpent) world.say("[announce] the day's announcement allowance is spent; the rest goes out on a later day.");
  if (summary.finished) world.say("[announce] every recipient is settled, so the letter is done.");
  return summary;
}
