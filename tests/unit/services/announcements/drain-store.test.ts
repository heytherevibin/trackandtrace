import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null }));
vi.mock("@/services/supabase/admin", () => ({ createAdminSupabase: () => ({ rpc }) }));

import { finishLetter, letterState, openClaims, openLetters, remainingFor } from "@/services/announcements/drain-store";

const LETTER = { id: "L", list: "news", subject: "s", body: "b", state: "queued", queuedAt: "2026-10-01T09:00:00.000Z" };

beforeEach(() => rpc.mockClear());

describe("the runner's reads", () => {
  it("lists the open letters through announce_open_letters", async () => {
    rpc.mockResolvedValueOnce({ data: [LETTER], error: null });
    expect(await openLetters()).toEqual([LETTER]);
    expect(rpc).toHaveBeenCalledWith("announce_open_letters", {});
  });

  it.each([
    ["an empty subject", { subject: "" }],
    ["an unknown list", { list: "other" }],
    ["a state that is not open", { state: "done" }],
    ["no queued_at", { queuedAt: null }],
    ["an unreadable queued_at", { queuedAt: "yesterday-ish" }],
  ])("skips a letter with %s, says so, and still returns the rest", async (_name, spoil) => {
    // One malformed row must not stop every announcement for good: a `queued` letter with a null
    // queued_at is a row nothing guarantees against, and throwing would keep the whole queue
    // behind it unsent. The skipped letter is named in the log (an id is not an address).
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    rpc.mockResolvedValueOnce({ data: [{ ...LETTER, id: "BAD", ...spoil }, { ...LETTER, id: "GOOD" }], error: null });
    expect((await openLetters()).map((l) => l.id)).toEqual(["GOOD"]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.join(" "))).toContain("BAD");
    warn.mockRestore();
  });

  it("still throws when the answer is not a list at all, because that is the store failing and not a bad row", async () => {
    rpc.mockResolvedValueOnce({ data: { not: "a list" }, error: null });
    await expect(openLetters()).rejects.toThrow();
  });

  it("reads one letter's state, and null for a letter that is not there", async () => {
    rpc.mockResolvedValueOnce({ data: "stopped", error: null });
    expect(await letterState("L")).toBe("stopped");
    expect(rpc).toHaveBeenCalledWith("announce_letter_state", { p_letter: "L" });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await letterState("L")).toBeNull();
  });

  it("refuses a state it does not know, because Stop is read from this and a guess could keep sending", async () => {
    rpc.mockResolvedValueOnce({ data: "paused", error: null });
    await expect(letterState("L")).rejects.toThrow();
  });

  it("reads the rows that are not settled", async () => {
    const row = { personId: "p1", claimedAt: "2026-10-02T08:50:00.000Z", firstAttemptedAt: "2026-10-01T01:00:00.000Z", state: "sending" };
    rpc.mockResolvedValueOnce({ data: [row], error: null });
    expect(await openClaims("L")).toEqual([row]);
    expect(rpc).toHaveBeenCalledWith("announce_open_claims", { p_letter: "L" });
  });

  it("carries each row's own state through, because the report's unknown rule reads it and reads nothing without it", async () => {
    // The copy-through, not the read: a wrapper that validated `state` and then built its answer
    // from the other three fields would pass every assertion that only looks at those three, and
    // the rule that exists to surface an unknown delivery would go on being fed none.
    rpc.mockResolvedValueOnce({
      data: [
        { personId: "p1", claimedAt: "2026-10-02T08:50:00.000Z", firstAttemptedAt: "2026-10-01T01:00:00.000Z", state: "sending" },
        { personId: "p2", claimedAt: "2026-10-02T08:50:00.000Z", firstAttemptedAt: "2026-10-01T01:00:00.000Z", state: "unknown" },
      ],
      error: null,
    });
    expect((await openClaims("L")).map((r) => r.state)).toEqual(["sending", "unknown"]);
  });

  it("carries a first attempt that is missing as null, so the runner can call it stale rather than the read failing", async () => {
    rpc.mockResolvedValueOnce({ data: [{ personId: "p1", claimedAt: "2026-10-02T08:50:00.000Z", state: "sending" }, { personId: "p2", claimedAt: "2026-10-02T08:50:00.000Z", firstAttemptedAt: null, state: "unknown" }], error: null });
    expect((await openClaims("L")).map((r) => r.firstAttemptedAt)).toEqual([null, null]);
  });

  it("carries a claim time that is missing as null, because a hand-settled row has none", async () => {
    // The runbook tells an operator to settle a stuck delivery by hand, and a row written by hand
    // has no claim time. Throwing on it would make that ONE row fail every read of that letter, for
    // ever — and the letter it belongs to is by definition the one somebody is trying to fix.
    rpc.mockResolvedValueOnce({ data: [{ personId: "p1", firstAttemptedAt: null, state: "unknown" }, { personId: "p2", claimedAt: null, firstAttemptedAt: null, state: "unknown" }], error: null });
    expect((await openClaims("L")).map((r) => r.claimedAt)).toEqual([null, null]);
  });

  it("refuses a claim whose times are not strings, whose state it does not know, or that names no person", async () => {
    for (const bad of [
      { personId: "p1", claimedAt: "x", firstAttemptedAt: 5, state: "sending" },
      { personId: "p1", claimedAt: 5, firstAttemptedAt: null, state: "sending" },
      { claimedAt: "x", firstAttemptedAt: null, state: "sending" },
      { personId: "p1", claimedAt: "x", firstAttemptedAt: null },
      { personId: "p1", claimedAt: "x", firstAttemptedAt: null, state: "pending" },
    ]) {
      rpc.mockResolvedValueOnce({ data: [bad], error: null });
      await expect(openClaims("L")).rejects.toThrow();
    }
  });

  it("reads what is left as two whole numbers", async () => {
    rpc.mockResolvedValueOnce({ data: { pending: 3, sending: 1, lastSentAt: null }, error: null });
    expect(await remainingFor("L")).toEqual({ pending: 3, sending: 1, lastSentAt: null });
    rpc.mockResolvedValueOnce({ data: { pending: "3", sending: 1 }, error: null });
    await expect(remainingFor("L")).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: { pending: -1, sending: 0 }, error: null });
    await expect(remainingFor("L")).rejects.toThrow();
  });

  it("carries the last delivery time through, which is the field a wrapper silently drops", async () => {
    // This is the whole point of the assertion: the store computed `lastSentAt`, the wrapper built
    // `{pending, sending}` and dropped it, and the stuck report measured from `queuedAt` for ever
    // while every test stayed green. A test that checks only the two counts passes that wrapper.
    rpc.mockResolvedValueOnce({ data: { pending: 3, sending: 1, lastSentAt: "2026-10-02T08:00:00.000Z" }, error: null });
    expect(await remainingFor("L")).toEqual({ pending: 3, sending: 1, lastSentAt: "2026-10-02T08:00:00.000Z" });
  });

  it("reads an absent last delivery time as null, and refuses one that is not a time at all", async () => {
    rpc.mockResolvedValueOnce({ data: { pending: 3, sending: 1 }, error: null });
    expect((await remainingFor("L")).lastSentAt).toBeNull();
    rpc.mockResolvedValueOnce({ data: { pending: 3, sending: 1, lastSentAt: 17 }, error: null });
    await expect(remainingFor("L")).rejects.toThrow();
  });

  it("finishes a letter through announce_finish", async () => {
    await finishLetter("L");
    expect(rpc).toHaveBeenCalledWith("announce_finish", { p_letter: "L" });
  });

  it("throws when the database errors, so a failure is never read as an empty answer", async () => {
    for (const read of [() => openLetters(), () => letterState("L"), () => openClaims("L"), () => remainingFor("L"), () => finishLetter("L")]) {
      rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
      await expect(read()).rejects.toThrow();
    }
  });
});
