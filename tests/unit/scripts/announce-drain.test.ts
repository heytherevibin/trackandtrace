import { describe, expect, it } from "vitest";
import { drain, pickLetter } from "../../../scripts/announce-plan.mjs";
import { ANNOUNCEMENT_CEILING, refundAnnouncements, takeAnnouncements } from "@/services/announcements/budget";
import { letterText, listHeaders } from "@/services/announcements/letter";
import { key } from "@/services/email/allowance";
import { MemoryKv } from "@/services/kv";
import { signUnsubscribe, unsubscribeUrl } from "@/services/subscriptions/links";

// ---------------------------------------------------------------------------
// The runner's decisions, driven through the same `drain` the script runs, with the world injected.
// Nothing here touches a database, a store, or a mail provider.
//
// Three of these are invisible in production and are the reason this file exists:
//   * which letter drains first (a wrong pick sends fine and merely makes the console's "this
//     finishes about X" untrue);
//   * what a suppressed address becomes (a row left pending is retried every day, forever, and
//     spends the day's budget on mail that will never go);
//   * where the List-Unsubscribe header points (the human page is a GET and answers 405 to a mail
//     client's one-click POST — which fails only in a real mail client).
//
// The fake world records the LETTER ID every call carried, and answers only for the right one: a
// runner that asked about another letter would claim another letter's rows, dress them in this
// letter's subject and body, and mark rows it does not own. And the day's counter is the real one
// over an in-memory store, so "what the day was charged" is read off the counter, not asserted
// about a call.
// ---------------------------------------------------------------------------

const AT = new Date("2026-10-02T09:00:00.000Z");
const hoursAgo = (n: number) => new Date(AT.getTime() - n * 3_600_000).toISOString();
const KEY = Buffer.alloc(32, 7);
const ORIGIN = "https://trakline.in";
const FROM = "Trakline <updates@trakline.in>";
const PERSON = "11111111-1111-4111-8111-111111111111";

type Letter = { id: string; list: "news" | "availability"; subject: string; body: string; state: string; queuedAt: string };
const letter = (over: Partial<Letter> = {}): Letter => ({
  id: "L1",
  list: "news",
  subject: "A new chart view",
  body: "Hello.",
  state: "sending",
  queuedAt: hoursAgo(10),
  ...over,
});

type Door = { outcome: "sent"; id: string } | { outcome: "captured" } | { outcome: "failed" } | { outcome: "suppressed" };
type Rows = { personId: string; email: string }[];
type Claim = { personId: string; claimedAt: string; firstAttemptedAt: string | null };
type Left = { pending: number; sending: number };

const AB: Rows = [{ personId: "p1", email: "a@example.in" }, { personId: "p2", email: "b@example.in" }];
const people = (n: number): Rows => Array.from({ length: n }, (_, i) => ({ personId: `q${i + 1}`, email: `q${i + 1}@example.in` }));

/** A world that records every call, so a test can say what happened, to which letter, and in what order. */
function world(over: {
  letters?: Letter[];
  rows?: Rows;
  claims?: Claim[];
  /** What the day still allows: 40 less what was already spent on it. */
  budget?: number;
  remaining?: Left[];
  door?: (email: string) => Door;
  states?: Array<string | null>;
  /** The letter whose rows these are; a call about any other letter finds nothing. */
  owner?: string;
} = {}) {
  const log: string[] = [];
  const seen: Record<string, string[]> = {};
  const note = (fn: string, id: string) => void (seen[fn] ??= []).push(id);
  const sends: { to: string; text: string; headers: Record<string, string>; subject: string; from: string; kind: string; key: string | undefined }[] = [];
  const said: string[] = [];
  const remaining = [...(over.remaining ?? [{ pending: 2, sending: 0 }, { pending: 0, sending: 0 }])];
  const states = [...(over.states ?? [])];
  const owner = over.owner ?? "L1";
  const rows = over.rows ?? AB;
  let given = 0;

  const kv = new MemoryKv();
  const spent = ANNOUNCEMENT_CEILING - (over.budget ?? ANNOUNCEMENT_CEILING);
  const prefill = spent > 0 ? kv.incrBy(key("t", AT), 3_600_000 * 48, spent) : Promise.resolve(0);
  const counter = async (): Promise<number> => Number((await kv.get(key("t", AT))) ?? 0) - spent;

  const w = {
    deps: { letterText, listHeaders, unsubscribeUrl },
    sign: (person: string, list: string) => signUnsubscribe(KEY, person, list),
    now: () => AT,
    say: (line: string) => void said.push(line),
    openLetters: async () => over.letters ?? [letter()],
    stateOf: async (id: string) => {
      note("stateOf", id);
      return states.length > 0 ? (states.shift() as string | null) : "sending";
    },
    openClaims: async (id: string) => {
      note("openClaims", id);
      return id === owner ? (over.claims ?? []) : [];
    },
    remaining: async (id: string) => {
      note("remaining", id);
      const next = remaining.length > 1 ? (remaining.shift() as Left) : (remaining[0] as Left);
      return next;
    },
    take: async (want: number, at: Date) => {
      await prefill;
      log.push(`take ${want}`);
      return takeAnnouncements(kv, "t", at, want);
    },
    refund: async (n: number, at: Date) => {
      log.push(`refund ${n}`);
      await refundAnnouncements(kv, "t", at, n);
    },
    claim: async (id: string, n: number) => {
      note("claim", id);
      log.push(`claim ${id} ${n}`);
      if (id !== owner) return [];
      const out = rows.slice(given, given + n);
      given += out.length;
      return out;
    },
    mark: async (id: string, person: string, state: string, providerId: string | null) => {
      note("mark", id);
      log.push(`mark ${id} ${person} ${state} ${providerId}`);
    },
    finish: async (id: string) => {
      note("finish", id);
      log.push(`finish ${id}`);
    },
    send: async (mail: { to: string; text: string; headers: Record<string, string>; subject: string; from: string }, kind: string, idempotencyKey?: string) => {
      sends.push({ ...mail, kind, key: idempotencyKey });
      log.push(`send ${mail.to}`);
      return (over.door ?? ((to: string): Door => ({ outcome: "sent", id: `r-${to}` })))(mail.to);
    },
  };
  return { w, log, seen, sends, said, counter };
}

const run = (w: ReturnType<typeof world>["w"]) => drain(w, { origin: ORIGIN, from: FROM, batchMax: ANNOUNCEMENT_CEILING });
const takes = (log: string[]) => log.filter((l) => l.startsWith("take ")).map((l) => Number(l.slice(5)));

describe("which letter drains", () => {
  it("is the oldest queued one, not the newest and not the first listed", () => {
    const letters = [
      letter({ id: "newest", queuedAt: hoursAgo(1) }),
      letter({ id: "oldest", state: "queued", queuedAt: hoursAgo(50) }),
      letter({ id: "middle", queuedAt: hoursAgo(20) }),
    ];
    expect(pickLetter(letters)?.id).toBe("oldest");
  });

  it("ignores a letter that is done, stopped or still a draft, however old", () => {
    const letters = [
      letter({ id: "done", state: "done", queuedAt: hoursAgo(900) }),
      letter({ id: "stopped", state: "stopped", queuedAt: hoursAgo(800) }),
      letter({ id: "draft", state: "draft", queuedAt: hoursAgo(700) }),
      letter({ id: "live", state: "queued", queuedAt: hoursAgo(5) }),
    ];
    expect(pickLetter(letters)?.id).toBe("live");
  });

  it("is nothing when nothing is open", () => {
    expect(pickLetter([])).toBeNull();
    expect(pickLetter([letter({ state: "done" })])).toBeNull();
  });

  it("finishes the older letter before a newer one is touched", async () => {
    const { w, log } = world({ owner: "older", letters: [letter({ id: "newer", queuedAt: hoursAgo(1) }), letter({ id: "older", queuedAt: hoursAgo(9) })] });
    await run(w);
    expect(log.filter((l) => l.startsWith("finish"))).toEqual(["finish older"]);
  });
});

describe("every call is about the letter being drained", () => {
  it("asks about, claims for, marks and finishes the picked letter and no other", async () => {
    // Claiming another letter's rows would send them this letter's subject and body, mark rows the
    // letter does not own, and leave the other letter's rows `sending` forever.
    const { w, seen, log } = world({ claims: [{ personId: "old", claimedAt: hoursAgo(1), firstAttemptedAt: hoursAgo(30) }] });
    await run(w);
    for (const fn of ["stateOf", "openClaims", "remaining", "claim", "mark", "finish"]) {
      expect(seen[fn]?.length, `${fn} was called`).toBeGreaterThan(0);
      expect(new Set(seen[fn]), `${fn} asked about one letter`).toEqual(new Set(["L1"]));
    }
    expect(log.filter((l) => l.startsWith("send"))).toHaveLength(2);
  });
});

describe("a run, in order", () => {
  it("marks a row first attempted over 24 hours ago unknown BEFORE it takes any budget or claims anything, however often it was re-claimed", async () => {
    const claims = [
      // Re-claimed 30 minutes ago, but its idempotency key was first used 25 hours ago, so Resend
      // has forgotten it: a retry now could send the letter twice.
      { personId: "old", claimedAt: hoursAgo(0.5), firstAttemptedAt: hoursAgo(25) },
      { personId: "fresh", claimedAt: hoursAgo(1 / 3), firstAttemptedAt: hoursAgo(23) },
    ];
    const { w, log } = world({ claims });
    await run(w);
    expect(log[0]).toBe("mark L1 old unknown null");
    expect(log.indexOf("mark L1 old unknown null")).toBeLessThan(log.findIndex((l) => l.startsWith("take")));
    expect(log.some((l) => l.startsWith("mark L1 fresh"))).toBe(false);
  });

  it("claims exactly what the day's budget allowed", async () => {
    const { w, log } = world({ budget: 1, remaining: [{ pending: 2, sending: 0 }, { pending: 1, sending: 0 }] });
    await run(w);
    expect(log).toContain("take 2");
    expect(log).toContain("claim L1 1");
  });

  it("sends nothing, and does not finish the letter, when the day is spent", async () => {
    const { w, log, sends } = world({ budget: 0 });
    const summary = await run(w);
    expect(sends).toEqual([]);
    expect(log.some((l) => l.startsWith("finish"))).toBe(false);
    expect(summary.budgetSpent).toBe(true);
  });

  it("asks the counter once and stops when the day is spent, rather than asking again and again", async () => {
    // `break` to `continue` here would spin to the loop's guard making fifty pointless reservations
    // against a counter every other kind of mail shares.
    // `remaining` keeps answering 2 pending, so only the break can end the loop: a default that went
    // on to say "none left" would end it by finishing the letter and hide the mutation.
    const { w, log } = world({ budget: 0, remaining: [{ pending: 2, sending: 0 }] });
    await run(w);
    expect(takes(log)).toEqual([2]);
  });

  it("never asks for more than the ceiling in one reservation, however much is waiting", async () => {
    const { w, log } = world({ rows: people(100), remaining: [{ pending: 100, sending: 0 }, { pending: 60, sending: 0 }, { pending: 0, sending: 0 }] });
    await run(w);
    expect(takes(log)[0]).toBe(ANNOUNCEMENT_CEILING);
    expect(log).toContain("claim L1 40");
  });

  it("does nothing when no letter is open", async () => {
    const { w, log } = world({ letters: [] });
    await run(w);
    expect(log).toEqual([]);
  });
});

describe("what the first batch may claim", () => {
  // A row a previous run left `sending` may be retried, so the FIRST batch reserves for pending and
  // sending together. After that only `pending` can be claimed: a row this run just failed is inside
  // the claim's 15-minute floor, and reserving for it spends allowance on a claim that returns nothing.
  const fixture = () => world({ rows: people(20), remaining: [{ pending: 3, sending: 5 }, { pending: 3, sending: 2 }, { pending: 0, sending: 0 }] });

  it("reserves pending plus sending on the first batch, and pending alone afterwards", async () => {
    const { w, log } = fixture();
    await run(w);
    expect(takes(log)).toEqual([8, 3]);
  });

  it("claims the retries as well as the new rows on the first batch", async () => {
    // Were it `pending` alone, a row left `sending` by any transient failure would never be
    // re-claimed by any run: a recipient silently never sent to, and a letter that never finishes.
    const { w, log } = fixture();
    await run(w);
    expect(log).toContain("claim L1 8");
    expect(log).toContain("claim L1 3");
  });
});

describe("the shared day's counter is charged for what was claimed, and no more", () => {
  it("nets 2, not 40, when 40 were reserved and only 2 could be claimed", async () => {
    // 2 pending and 38 claimed eight minutes ago: the claim will not return those 38. Counting 40
    // for two emails would take the confirmations' band of 40-60 down to 20.
    const { w, log, counter } = world({ rows: people(2), remaining: [{ pending: 2, sending: 38 }, { pending: 0, sending: 38 }] });
    await run(w);
    expect(takes(log)).toEqual([40]);
    expect(log).toContain("refund 38");
    expect(await counter()).toBe(2);
  });

  it("nets 0 when every row is inside the re-claim floor and nothing could be claimed", async () => {
    const { w, log, counter, sends } = world({ rows: [], remaining: [{ pending: 0, sending: 40 }] });
    await run(w);
    expect(sends).toEqual([]);
    expect(log).toContain("refund 40");
    expect(await counter()).toBe(0);
  });

  it("refunds nothing when everything reserved was claimed", async () => {
    const { w, log, counter } = world({ rows: people(5), remaining: [{ pending: 5, sending: 0 }, { pending: 0, sending: 0 }] });
    await run(w);
    expect(log.some((l) => l.startsWith("refund"))).toBe(false);
    expect(await counter()).toBe(5);
  });
});

describe("what each outcome becomes", () => {
  it("marks a send sent, carrying the provider's id so a later bounce can be tied back", async () => {
    const { w, log, sends } = world({ rows: [{ personId: "p1", email: "a@example.in" }] });
    await run(w);
    expect(log).toContain("mark L1 p1 sent r-a@example.in");
    expect(sends[0]?.kind).toBe("list");
  });

  it("marks a captured send sent (the E2E outbox), with no provider id", async () => {
    const { w, log } = world({ rows: [{ personId: "p1", email: "a@example.in" }], door: () => ({ outcome: "captured" }) });
    await run(w);
    expect(log).toContain("mark L1 p1 sent null");
  });

  it("marks a suppressed address SKIPPED, never leaves it pending to be retried every day", async () => {
    const { w, log } = world({
      rows: [{ personId: "p1", email: "a@example.in" }],
      door: () => ({ outcome: "suppressed" }),
    });
    const summary = await run(w);
    expect(log).toContain("mark L1 p1 skipped null");
    expect(log.some((l) => l.startsWith("mark L1 p1 sent") || l.startsWith("mark L1 p1 unknown"))).toBe(false);
    expect(summary.skipped).toBe(1);
  });

  it("leaves a failed send unmarked, so the next run retries it inside the window", async () => {
    const { w, log } = world({ rows: [{ personId: "p1", email: "a@example.in" }], door: () => ({ outcome: "failed" }) });
    const summary = await run(w);
    expect(log.some((l) => l.startsWith("mark L1 p1"))).toBe(false);
    expect(summary.failed).toBe(1);
  });

  it("keeps going past a failure to the next recipient", async () => {
    const { w, log } = world({ door: (to) => (to === "a@example.in" ? { outcome: "failed" } : { outcome: "sent", id: "r2" }) });
    await run(w);
    expect(log).toContain("mark L1 p2 sent r2");
  });

  it("does not finish the letter while a failed row is still waiting for its retry", async () => {
    const { w, log } = world({ remaining: [{ pending: 2, sending: 0 }, { pending: 0, sending: 2 }], door: () => ({ outcome: "failed" }) });
    await run(w);
    expect(log.some((l) => l.startsWith("finish"))).toBe(false);
  });

  it("finishes the letter when nothing is pending or waiting", async () => {
    const { w, log } = world();
    const summary = await run(w);
    expect(log.at(-1)).toBe("finish L1");
    expect(summary.finished).toBe(true);
  });

  it("gives each recipient its own idempotency key, inside Resend's length limit", async () => {
    const { w, sends } = world();
    await run(w);
    expect(sends.map((s) => s.key)).toEqual(["L1:p1", "L1:p2"]);
  });
});

describe("what the mail says", () => {
  it("points List-Unsubscribe at the one-click POST endpoint, never at the human page", async () => {
    // The human /unsubscribe page is a GET route and answers 405 to a mail client's one-click
    // POST. Nothing else in the system would notice: it fails only in a real mail client.
    const { w, sends } = world({ rows: [{ personId: PERSON, email: "a@example.in" }] });
    await run(w);
    const sig = signUnsubscribe(KEY, PERSON, "news");
    expect(sends[0]?.headers["List-Unsubscribe"]).toBe(`<${ORIGIN}/api/unsubscribe/one-click?p=${PERSON}&l=news&s=${sig}>`);
    expect(sends[0]?.headers["List-Unsubscribe"]).not.toContain("/unsubscribe?");
    expect(sends[0]?.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("keeps the HUMAN page's link in the body, where a person clicks it", async () => {
    const { w, sends } = world({ rows: [{ personId: PERSON, email: "a@example.in" }] });
    await run(w);
    const sig = signUnsubscribe(KEY, PERSON, "news");
    expect(sends[0]?.text).toContain(`${ORIGIN}/unsubscribe?p=${PERSON}&l=news&s=${sig}`);
    expect(sends[0]?.text).not.toContain("/api/unsubscribe/one-click");
    expect(sends[0]?.text.startsWith("Hello.")).toBe(true);
  });

  it("signs the link for the list the letter is going to", async () => {
    const { w, sends } = world({ letters: [letter({ list: "availability" })], rows: [{ personId: PERSON, email: "a@example.in" }] });
    await run(w);
    const sig = signUnsubscribe(KEY, PERSON, "availability");
    expect(sends[0]?.headers["List-Unsubscribe"]).toContain(`l=availability&s=${sig}`);
  });

  it("sends from the configured address, with the letter's subject, to the claimed address", async () => {
    const { w, sends } = world({ rows: [{ personId: "p1", email: "a@example.in" }] });
    await run(w);
    expect(sends[0]).toMatchObject({ from: FROM, subject: "A new chart view", to: "a@example.in" });
  });
});

describe("Stop", () => {
  it("is read before each batch: a letter stopped before the run takes no budget at all", async () => {
    const { w, log } = world({ states: ["stopped"] });
    const summary = await run(w);
    expect(log.some((l) => l.startsWith("take") || l.startsWith("claim"))).toBe(false);
    expect(summary.stopped).toBe(true);
  });

  it("is read before each send: a Stop mid-batch takes effect at the next recipient, not the end", async () => {
    // First state read is the batch check; the second is before p1's send; the third is before p2's.
    const { w, log, sends } = world({ states: ["sending", "sending", "stopped"] });
    const summary = await run(w);
    expect(sends.map((s) => s.to)).toEqual(["a@example.in"]);
    expect(log).toContain("mark L1 p1 sent r-a@example.in");
    expect(summary.stopped).toBe(true);
    expect(log.some((l) => l.startsWith("finish"))).toBe(false);
  });
});

describe("what a run prints", () => {
  it("never names an address, a signature, or any of the letter's own words", async () => {
    const { w, said } = world({
      letters: [letter({ subject: "SUBJECT-MARKER-4471", body: "BODY-MARKER-9023 and more" })],
      rows: [{ personId: "p1", email: "a@example.in" }, { personId: "p2", email: "b@example.in" }, { personId: "p3", email: "c@example.in" }],
      remaining: [{ pending: 3, sending: 0 }, { pending: 0, sending: 1 }],
      claims: [{ personId: "old", claimedAt: hoursAgo(1), firstAttemptedAt: hoursAgo(30) }],
      door: (to) => (to === "a@example.in" ? { outcome: "suppressed" } : to === "b@example.in" ? { outcome: "failed" } : { outcome: "sent", id: "provider-id-77" }),
    });
    await run(w);
    const text = said.join("\n");
    expect(said.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/@/);
    expect(text).not.toContain("SUBJECT-MARKER");
    expect(text).not.toContain("BODY-MARKER");
    expect(text).not.toContain("provider-id-77");
    for (const p of ["p1", "p2", "p3", PERSON]) expect(text).not.toContain(signUnsubscribe(KEY, p, "news"));
  });
});
