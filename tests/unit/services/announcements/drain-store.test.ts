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

  it("throws on a letter of the wrong shape rather than dropping it, since a dropped letter is a letter never sent", async () => {
    rpc.mockResolvedValueOnce({ data: [{ ...LETTER, subject: "" }], error: null });
    await expect(openLetters()).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: [{ ...LETTER, list: "other" }], error: null });
    await expect(openLetters()).rejects.toThrow();
    rpc.mockResolvedValueOnce({ data: [{ ...LETTER, state: "done" }], error: null });
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
    rpc.mockResolvedValueOnce({ data: [{ personId: "p1", claimedAt: "2026-10-01T01:00:00.000Z" }], error: null });
    expect(await openClaims("L")).toEqual([{ personId: "p1", claimedAt: "2026-10-01T01:00:00.000Z" }]);
    expect(rpc).toHaveBeenCalledWith("announce_open_claims", { p_letter: "L" });
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
