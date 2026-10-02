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

  it("reads the rows still claimed", async () => {
    const row = { personId: "p1", claimedAt: "2026-10-02T08:50:00.000Z", firstAttemptedAt: "2026-10-01T01:00:00.000Z" };
    rpc.mockResolvedValueOnce({ data: [row], error: null });
    expect(await openClaims("L")).toEqual([row]);
    expect(rpc).toHaveBeenCalledWith("announce_open_claims", { p_letter: "L" });
  });

  it("carries a first attempt that is missing as null, so the runner can call it stale rather than the read failing", async () => {
    rpc.mockResolvedValueOnce({ data: [{ personId: "p1", claimedAt: "2026-10-02T08:50:00.000Z" }, { personId: "p2", claimedAt: "2026-10-02T08:50:00.000Z", firstAttemptedAt: null }], error: null });
    expect((await openClaims("L")).map((r) => r.firstAttemptedAt)).toEqual([null, null]);
  });

  it("refuses a claim whose first attempt is not a string or null, or whose person or claim time is missing", async () => {
    for (const bad of [{ personId: "p1", claimedAt: "x", firstAttemptedAt: 5 }, { claimedAt: "x", firstAttemptedAt: null }, { personId: "p1", firstAttemptedAt: null }]) {
      rpc.mockResolvedValueOnce({ data: [bad], error: null });
      await expect(openClaims("L")).rejects.toThrow();
    }
  });

  it("reads what is left as two whole numbers", async () => {
    rpc.mockResolvedValueOnce({ data: { pending: 3, sending: 1 }, error: null });
    expect(await remainingFor("L")).toEqual({ pending: 3, sending: 1 });
    rpc.mockResolvedValueOnce({ data: { pending: "3", sending: 1 }, error: null });
    await expect(remainingFor("L")).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: { pending: -1, sending: 0 }, error: null });
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
