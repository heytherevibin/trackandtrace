import { describe, expect, it } from "vitest";
import { exitCodeFor, stuck, summarise } from "../../../scripts/announce-coverage.mjs";

const AT = new Date("2026-10-02T09:00:00.000Z");
const hoursAgo = (n: number) => new Date(AT.getTime() - n * 3_600_000).toISOString();

const claim = (over = {}) => ({ letterId: "L", personId: "p1", state: "sending", claimedAt: hoursAgo(1), firstAttemptedAt: hoursAgo(25), ...over });

const letter = (over = {}) => ({ id: "L", state: "sending", pending: 10, lastSentAt: hoursAgo(1), ...over });

describe("what counts as stuck", () => {
  it("is nothing when a letter is advancing", () => {
    expect(stuck([letter()], [], AT)).toEqual([]);
  });

  it("names a letter whose pending count has not fallen in 48 hours", () => {
    // The job runs daily. Two runs with no progress means the job is not running, or every send
    // is failing — either way a person should look.
    expect(stuck([letter({ lastSentAt: hoursAgo(49) })], [], AT))
      .toEqual([{ letterId: "L", why: "no delivery in 48 hours, 10 still pending" }]);
  });

  it("names a delivery still claimed past the idempotency window", () => {
    const rows = [{ letterId: "L", personId: "p1", state: "sending", claimedAt: hoursAgo(25) }];
    expect(stuck([letter()], rows, AT))
      .toEqual([{ letterId: "L", why: "1 delivery claimed over 24 hours ago and never marked" }]);
  });

  it("names any unknown at all, because it is never normal", () => {
    const rows = [{ letterId: "L", personId: "p1", state: "unknown", claimedAt: hoursAgo(30) }];
    expect(stuck([letter()], rows, AT)).toEqual([{ letterId: "L", why: "1 unknown: we cannot say whether it was sent" }]);
  });

  it("says nothing about a done letter, whatever its history", () => {
    expect(stuck([letter({ state: "done", pending: 0, lastSentAt: hoursAgo(300) })], [], AT)).toEqual([]);
  });
});

describe("the edges of each rule", () => {
  it("does not name a letter at exactly 48 hours since its last delivery, but does just past it: a daily job lands on the boundary", () => {
    expect(stuck([letter({ lastSentAt: hoursAgo(48) })], [], AT)).toEqual([]);
    expect(stuck([letter({ lastSentAt: hoursAgo(48.01) })], [], AT)).toHaveLength(1);
  });

  it("names a claim at exactly 24 hours, as the runner does: the claim stops re-claiming there, so it is neither retryable nor unknown", () => {
    // Inclusive, like `staleClaims` in announce-plan.mjs, because a strictly daily schedule lands exactly here.
    expect(stuck([letter()], [claim({ firstAttemptedAt: hoursAgo(24) })], AT)).toHaveLength(1);
    expect(stuck([letter()], [claim({ firstAttemptedAt: hoursAgo(23.99) })], AT)).toEqual([]);
  });

  it("counts every stale claim, and says deliveries in the plural", () => {
    const rows = [
      claim({ personId: "p1", firstAttemptedAt: hoursAgo(25) }),
      claim({ personId: "p2", firstAttemptedAt: hoursAgo(40) }),
      claim({ personId: "p3", firstAttemptedAt: hoursAgo(2) }),
    ];
    expect(stuck([letter()], rows, AT)).toEqual([{ letterId: "L", why: "2 deliveries claimed over 24 hours ago and never marked" }]);
  });

  it("measures a claim from its FIRST attempt, because a re-claim does not renew the provider's memory of the key", () => {
    // Claimed 30 hours ago, re-claimed one hour ago. The 24-hour window runs from the first attempt.
    const rows = [claim({ claimedAt: hoursAgo(1), firstAttemptedAt: hoursAgo(30) })];
    expect(stuck([letter()], rows, AT)).toEqual([{ letterId: "L", why: "1 delivery claimed over 24 hours ago and never marked" }]);
  });

  it("counts a claim whose first attempt is null, absent or unreadable as stale, never as fresh, matching the runner", () => {
    // `claimedAt` restarts on every re-claim, so falling back to it would go blind exactly where a
    // duplicate send hides: a row re-claimed each day would never look old.
    const fresh = { letterId: "L", personId: "p1", state: "sending", claimedAt: hoursAgo(2) };
    const why = "1 delivery claimed over 24 hours ago and never marked";
    expect(stuck([letter()], [{ ...fresh, firstAttemptedAt: null }], AT)).toEqual([{ letterId: "L", why }]);
    expect(stuck([letter()], [fresh], AT)).toEqual([{ letterId: "L", why }]);
    expect(stuck([letter()], [{ ...fresh, firstAttemptedAt: "not a date" }], AT)).toEqual([{ letterId: "L", why }]);
  });

  it("does not read a last-sent time it cannot date as recent progress", () => {
    expect(stuck([letter({ lastSentAt: "not a date" })], [], AT)).toEqual([{ letterId: "L", why: "no delivery in 48 hours, 10 still pending" }]);
  });

  it("ignores a claim that belongs to a letter it was not given", () => {
    const rows = [{ letterId: "other", personId: "p1", state: "unknown", claimedAt: hoursAgo(30) }];
    expect(stuck([letter()], rows, AT)).toEqual([]);
  });

  it("counts only deliveries that are `sending` as claims and only `unknown` ones as unknowns: a sent or skipped row is neither", () => {
    const rows = [
      claim({ personId: "p1", state: "sent", firstAttemptedAt: hoursAgo(30) }),
      claim({ personId: "p2", state: "skipped", firstAttemptedAt: hoursAgo(30) }),
    ];
    expect(stuck([letter()], rows, AT)).toEqual([]);
  });
});

describe("an open letter with no work left", () => {
  // `drain` stops on a spent allowance BEFORE it re-reads what remains, so the normal end of a day's
  // run can leave a letter with nothing pending and nothing in flight that was never marked done.
  // The next run finishes it. If a few days pass and it is still open, the job is not running, and
  // with one letter there is no neighbour to raise the alarm: a clean bill of health would be false.
  const finished = (over = {}) => letter({ pending: 0, sending: 0, ...over });

  it("is named once it has sat 48 hours since its last delivery: it finished its work and was never marked done", () => {
    expect(stuck([finished({ lastSentAt: hoursAgo(120) })], [], AT))
      .toEqual([{ letterId: "L", why: "no work left, but it was never marked done" }]);
  });

  it("is nothing inside those 48 hours, because the next daily run has not had its turn", () => {
    expect(stuck([finished({ lastSentAt: hoursAgo(20) })], [], AT)).toEqual([]);
    expect(stuck([finished({ lastSentAt: hoursAgo(48) })], [], AT)).toEqual([]);
  });

  it("is named when it never sent at all and was queued over 48 hours ago", () => {
    expect(stuck([finished({ state: "queued", lastSentAt: null, queuedAt: hoursAgo(49) })], [], AT)).toHaveLength(1);
    expect(stuck([finished({ state: "queued", lastSentAt: null, queuedAt: hoursAgo(1) })], [], AT)).toEqual([]);
  });

  it("is not named for it while a delivery is still in flight: the claim rule speaks for that", () => {
    expect(stuck([finished({ sending: 2, lastSentAt: hoursAgo(120) })], [], AT)).toEqual([]);
  });

  it("is still nothing for a letter that is done, however old", () => {
    expect(stuck([finished({ state: "done", lastSentAt: hoursAgo(300) })], [], AT)).toEqual([]);
  });
});

describe("one entry per reason, not one per letter", () => {
  it("names both when a letter that IS advancing also carries a stale claim and an unknown", () => {
    // lastSentAt an hour ago: the letter is moving. The stale claim and the unknown are separate
    // facts about separate rows, and one silently winning would hide the other.
    const rows = [
      { letterId: "L", personId: "p1", state: "sending", claimedAt: hoursAgo(25) },
      { letterId: "L", personId: "p2", state: "unknown", claimedAt: hoursAgo(30) },
    ];
    expect(stuck([letter()], rows, AT)).toEqual([
      { letterId: "L", why: "1 delivery claimed over 24 hours ago and never marked" },
      { letterId: "L", why: "1 unknown: we cannot say whether it was sent" },
    ]);
  });

  it("orders no-delivery first, then stale claims, then unknowns, whatever order the rows arrive in", () => {
    const rows = [
      { letterId: "L", personId: "p2", state: "unknown", claimedAt: hoursAgo(30) },
      { letterId: "L", personId: "p1", state: "sending", claimedAt: hoursAgo(25) },
    ];
    expect(stuck([letter({ lastSentAt: hoursAgo(60) })], rows, AT).map((entry) => entry.why)).toEqual([
      "no delivery in 48 hours, 10 still pending",
      "1 delivery claimed over 24 hours ago and never marked",
      "1 unknown: we cannot say whether it was sent",
    ]);
  });

  it("lists every letter's first reason before any letter's second: reason-major, not letter-major", () => {
    const letters = [letter({ id: "B", lastSentAt: hoursAgo(60) }), letter({ id: "A", lastSentAt: hoursAgo(60) })];
    const rows = [
      claim({ letterId: "A" }),
      claim({ letterId: "B" }),
      claim({ letterId: "A", personId: "p2", state: "unknown" }),
      claim({ letterId: "B", personId: "p2", state: "unknown" }),
    ];
    expect(stuck(letters, rows, AT).map((entry) => `${entry.letterId}: ${entry.why}`)).toEqual([
      "B: no delivery in 48 hours, 10 still pending",
      "A: no delivery in 48 hours, 10 still pending",
      "B: 1 delivery claimed over 24 hours ago and never marked",
      "A: 1 delivery claimed over 24 hours ago and never marked",
      "B: 1 unknown: we cannot say whether it was sent",
      "A: 1 unknown: we cannot say whether it was sent",
    ]);
  });

  it("keeps letters in input order within a reason", () => {
    const letters = [letter({ id: "B", lastSentAt: hoursAgo(60) }), letter({ id: "A", lastSentAt: hoursAgo(60) })];
    expect(stuck(letters, [], AT).map((entry) => entry.letterId)).toEqual(["B", "A"]);
  });
});

describe("a letter that is stopped is not stuck", () => {
  it("yields nothing for an old claim: a Stop mid-batch leaves claimed rows that will never be opened again", () => {
    // Without this, every stopped letter would be flagged for ever, and a report that always has an
    // entry is a report nobody reads.
    const rows = [{ letterId: "L", personId: "p1", state: "sending", claimedAt: hoursAgo(300) }];
    expect(stuck([letter({ state: "stopped" })], rows, AT)).toEqual([]);
  });

  it("yields nothing for a stopped letter that stopped sending long ago, for the same reason", () => {
    expect(stuck([letter({ state: "stopped", lastSentAt: hoursAgo(300) })], [], AT)).toEqual([]);
  });

  it("still names a neighbour that is stuck", () => {
    const letters = [letter({ id: "S", state: "stopped", lastSentAt: hoursAgo(300) }), letter({ id: "N", lastSentAt: hoursAgo(60) })];
    expect(stuck(letters, [], AT).map((entry) => entry.letterId)).toEqual(["N"]);
  });
});

describe("a letter that has never sent", () => {
  const queued = (over = {}) => letter({ state: "queued", lastSentAt: null, queuedAt: hoursAgo(1), ...over });

  it("is nothing when it is freshly queued and nothing is pending", () => {
    // Null is "has never sent", never the epoch. As the epoch it would be 56 years stale, and the
    // report would cry wolf on its first run.
    expect(stuck([queued({ pending: 0 })], [], AT)).toEqual([]);
  });

  it("is nothing when it is freshly queued with rows pending: the job has not had its two runs yet", () => {
    expect(stuck([queued()], [], AT)).toEqual([]);
  });

  it("is named when rows are pending and it was queued over 48 hours ago and has still never sent", () => {
    // This is the case the report exists for: queued, and the job never ran, or never succeeded once.
    // Reading null as "nothing to measure" would leave it silent for ever.
    expect(stuck([queued({ queuedAt: hoursAgo(49) })], [], AT))
      .toEqual([{ letterId: "L", why: "nothing delivered in the 48 hours since it was queued, 10 still pending" }]);
  });

  it("is named just past 48 hours since it was queued and not at exactly 48, as for a letter that has sent", () => {
    expect(stuck([queued({ queuedAt: hoursAgo(48) })], [], AT)).toEqual([]);
    expect(stuck([queued({ queuedAt: hoursAgo(48.01) })], [], AT)).toHaveLength(1);
  });

  it("reads an absent lastSentAt exactly as a null one, because the store does not supply it yet", () => {
    // No `lastSentAt` key at all, as `remainingFor` returns today.
    const without = { id: "L", state: "queued", pending: 10, queuedAt: hoursAgo(49) };
    expect(stuck([without], [], AT)).toEqual(stuck([queued({ queuedAt: hoursAgo(49) })], [], AT));
    expect(stuck([without], [], AT)).toHaveLength(1);
    expect(stuck([{ ...without, queuedAt: hoursAgo(1) }], [], AT)).toEqual([]);
  });

  it("is nothing when there is no time to measure from at all, rather than a guess", () => {
    expect(stuck([queued({ queuedAt: undefined })], [], AT)).toEqual([]);
  });
});

describe("the report", () => {
  it("exits 0 when nothing is stuck and 1 when something is", () => {
    expect(exitCodeFor([])).toBe(0);
    expect(exitCodeFor([{ letterId: "L", why: "x" }])).toBe(1);
  });

  it("is a severity ladder, highest wins: 2 (incomplete) beats 1 (something stuck) beats 0", () => {
    // An incomplete report with findings is still incomplete: the letter it could not read must not
    // be masked by a finding elsewhere, or the more serious signal loses to the less serious.
    expect(exitCodeFor([], 1)).toBe(2);
    expect(exitCodeFor([{ letterId: "L", why: "x" }], 1)).toBe(2);
    expect(exitCodeFor([{ letterId: "L", why: "x" }], 0)).toBe(1);
    expect(exitCodeFor([], 0)).toBe(0);
  });

  it("does not say nothing is stuck when a letter could not be read", () => {
    const text = summarise([], 2, 1).join("\n");
    expect(text).not.toMatch(/nothing is stuck/i);
    expect(text).toContain("1 letter could not be read");
  });

  it("says plainly that nothing is stuck, and how many letters it looked at", () => {
    expect(summarise([], 2).join("\n")).toMatch(/nothing is stuck/i);
    expect(summarise([], 2).join("\n")).toContain("2 open letters");
  });

  it("names each letter and reason", () => {
    const text = summarise([{ letterId: "L1", why: "1 unknown: we cannot say whether it was sent" }], 1).join("\n");
    expect(text).toContain("L1");
    expect(text).toContain("1 unknown: we cannot say whether it was sent");
  });

  it("prints no address, however the rows it was handed are shaped", () => {
    // The rows `claimDeliveries` hands a sender carry an address, and a letter carries its subject
    // and body. Nothing but an id and a reason may reach the output.
    const rows = [
      { letterId: "L", personId: "p1", state: "sending", claimedAt: hoursAgo(25), email: "someone@example.com" },
      { letterId: "L", personId: "p2", state: "unknown", claimedAt: hoursAgo(30), email: "other@example.com" },
    ];
    const letters = [letter({ lastSentAt: hoursAgo(60), subject: "mail me at ops@example.com", body: "reply to ops@example.com" })];
    const entries = stuck(letters, rows, AT);
    expect(entries.length).toBeGreaterThan(0);
    const out = [...summarise(entries, letters.length), JSON.stringify(entries)].join("\n");
    expect(out).not.toContain("@");
    expect(out).not.toContain("example.com");
  });
});
