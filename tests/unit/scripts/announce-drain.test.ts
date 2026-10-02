import { describe, expect, it } from "vitest";
import { drain, pickLetter } from "../../../scripts/announce-plan.mjs";
import { letterText, listHeaders } from "@/services/announcements/letter";
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
// ---------------------------------------------------------------------------

const AT = new Date("2026-10-02T09:00:00.000Z");
const hoursAgo = (n: number) => new Date(AT.getTime() - n * 3_600_000).toISOString();
const KEY = Buffer.alloc(32, 7);
const ORIGIN = "https://trakline.in";
const FROM = "Trakline <updates@trakline.in>";

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

/** A world that records every call, so a test can say what happened and in what order. */
function world(over: {
  letters?: Letter[];
  rows?: { personId: string; email: string }[];
  claims?: { personId: string; claimedAt: string }[];
  budget?: number;
  remaining?: Array<{ pending: number; sending: number }>;
  door?: (email: string) => Door;
  states?: Array<string | null>;
} = {}) {
  const log: string[] = [];
  const sends: { to: string; text: string; headers: Record<string, string>; subject: string; from: string; kind: string; key: string | undefined }[] = [];
  const said: string[] = [];
  const remaining = [...(over.remaining ?? [{ pending: 2, sending: 0 }, { pending: 0, sending: 0 }])];
  const states = [...(over.states ?? [])];
  let rowsGiven = false;
  const w = {
    deps: { letterText, listHeaders, unsubscribeUrl },
    sign: (person: string, list: string) => signUnsubscribe(KEY, person, list),
    now: () => AT,
    say: (line: string) => void said.push(line),
    openLetters: async () => over.letters ?? [letter()],
    stateOf: async () => (states.length > 0 ? (states.shift() as string | null) : "sending"),
    openClaims: async () => over.claims ?? [],
    remaining: async () => remaining.length > 1 ? (remaining.shift() as { pending: number; sending: number }) : (remaining[0] as { pending: number; sending: number }),
    take: async (want: number) => {
      log.push(`take ${want}`);
      return Math.min(want, over.budget ?? 40);
    },
    claim: async (_id: string, n: number) => {
      log.push(`claim ${n}`);
      if (rowsGiven) return [];
      rowsGiven = true;
      return (over.rows ?? [{ personId: "p1", email: "a@example.in" }, { personId: "p2", email: "b@example.in" }]).slice(0, n);
    },
    mark: async (id: string, person: string, state: string, providerId: string | null) => void log.push(`mark ${person} ${state} ${providerId}`),
    finish: async (id: string) => void log.push(`finish ${id}`),
    send: async (mail: { to: string; text: string; headers: Record<string, string>; subject: string; from: string }, kind: string, key?: string) => {
      sends.push({ ...mail, kind, key });
      log.push(`send ${mail.to}`);
      return (over.door ?? (() => ({ outcome: "sent", id: `r-${mail.to}` })))(mail.to);
    },
  };
  return { w, log, sends, said };
}

const run = (w: ReturnType<typeof world>["w"]) => drain(w, { origin: ORIGIN, from: FROM });

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
    const { w, log } = world({ letters: [letter({ id: "newer", queuedAt: hoursAgo(1) }), letter({ id: "older", queuedAt: hoursAgo(9) })] });
    await run(w);
    expect(log.filter((l) => l.startsWith("finish"))).toEqual(["finish older"]);
  });
});

describe("a run, in order", () => {
  it("marks stale claims unknown BEFORE it takes any budget or claims anything", async () => {
    const claims = [
      { personId: "old", claimedAt: hoursAgo(30) },
      { personId: "fresh", claimedAt: hoursAgo(1) },
    ];
    const { w, log } = world({ claims });
    await run(w);
    expect(log[0]).toBe("mark old unknown null");
    expect(log.indexOf("mark old unknown null")).toBeLessThan(log.findIndex((l) => l.startsWith("take")));
    expect(log).not.toContain("mark fresh unknown null");
  });

  it("claims exactly what the day's budget allowed", async () => {
    const { w, log } = world({ budget: 1, remaining: [{ pending: 2, sending: 0 }, { pending: 1, sending: 0 }] });
    await run(w);
    expect(log).toContain("take 2");
    expect(log).toContain("claim 1");
  });

  it("sends nothing, and does not finish the letter, when the day is spent", async () => {
    const { w, log, sends } = world({ budget: 0 });
    const summary = await run(w);
    expect(sends).toEqual([]);
    expect(log.some((l) => l.startsWith("finish"))).toBe(false);
    expect(summary.budgetSpent).toBe(true);
  });

  it("does nothing when no letter is open", async () => {
    const { w, log } = world({ letters: [] });
    await run(w);
    expect(log).toEqual([]);
  });
});

describe("what each outcome becomes", () => {
  it("marks a send sent, carrying the provider's id so a later bounce can be tied back", async () => {
    const { w, log, sends } = world({ rows: [{ personId: "p1", email: "a@example.in" }] });
    await run(w);
    expect(log).toContain("mark p1 sent r-a@example.in");
    expect(sends[0]?.kind).toBe("list");
  });

  it("marks a captured send sent (the E2E outbox), with no provider id", async () => {
    const { w, log } = world({ rows: [{ personId: "p1", email: "a@example.in" }], door: () => ({ outcome: "captured" }) });
    await run(w);
    expect(log).toContain("mark p1 sent null");
  });

  it("marks a suppressed address SKIPPED, never leaves it pending to be retried every day", async () => {
    const { w, log } = world({
      rows: [{ personId: "p1", email: "a@example.in" }],
      door: () => ({ outcome: "suppressed" }),
    });
    const summary = await run(w);
    expect(log).toContain("mark p1 skipped null");
    expect(log.some((l) => l.startsWith("mark p1 sent") || l.startsWith("mark p1 unknown"))).toBe(false);
    expect(summary.skipped).toBe(1);
  });

  it("leaves a failed send unmarked, so the next run retries it inside the window", async () => {
    const { w, log } = world({ rows: [{ personId: "p1", email: "a@example.in" }], door: () => ({ outcome: "failed" }) });
    const summary = await run(w);
    expect(log.some((l) => l.startsWith("mark p1"))).toBe(false);
    expect(summary.failed).toBe(1);
  });

  it("keeps going past a failure to the next recipient", async () => {
    const { w, log } = world({ door: (to) => (to === "a@example.in" ? { outcome: "failed" } : { outcome: "sent", id: "r2" }) });
    await run(w);
    expect(log).toContain("mark p2 sent r2");
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
    const { w, sends } = world({ rows: [{ personId: "11111111-1111-4111-8111-111111111111", email: "a@example.in" }] });
    await run(w);
    const sig = signUnsubscribe(KEY, "11111111-1111-4111-8111-111111111111", "news");
    expect(sends[0]?.headers["List-Unsubscribe"]).toBe(
      `<${ORIGIN}/api/unsubscribe/one-click?p=11111111-1111-4111-8111-111111111111&l=news&s=${sig}>`,
    );
    expect(sends[0]?.headers["List-Unsubscribe"]).not.toContain("/unsubscribe?");
    expect(sends[0]?.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("keeps the HUMAN page's link in the body, where a person clicks it", async () => {
    const { w, sends } = world({ rows: [{ personId: "11111111-1111-4111-8111-111111111111", email: "a@example.in" }] });
    await run(w);
    const sig = signUnsubscribe(KEY, "11111111-1111-4111-8111-111111111111", "news");
    expect(sends[0]?.text).toContain(`${ORIGIN}/unsubscribe?p=11111111-1111-4111-8111-111111111111&l=news&s=${sig}`);
    expect(sends[0]?.text).not.toContain("/api/unsubscribe/one-click");
    expect(sends[0]?.text.startsWith("Hello.")).toBe(true);
  });

  it("signs the link for the list the letter is going to", async () => {
    const { w, sends } = world({ letters: [letter({ list: "availability" })], rows: [{ personId: "11111111-1111-4111-8111-111111111111", email: "a@example.in" }] });
    await run(w);
    const sig = signUnsubscribe(KEY, "11111111-1111-4111-8111-111111111111", "availability");
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
    expect(log).toContain("mark p1 sent r-a@example.in");
    expect(summary.stopped).toBe(true);
    expect(log.some((l) => l.startsWith("finish"))).toBe(false);
  });
});

describe("what a run prints", () => {
  it("never names an address or a signature", async () => {
    const { w, said } = world({ door: (to) => (to === "a@example.in" ? { outcome: "suppressed" } : { outcome: "failed" }) });
    await run(w);
    const text = said.join("\n");
    expect(said.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/@/);
    expect(text).not.toContain(signUnsubscribe(KEY, "p1", "news"));
  });
});
