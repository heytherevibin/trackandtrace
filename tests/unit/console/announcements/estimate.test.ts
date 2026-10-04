import { describe, expect, it } from "vitest";
import { daysFor, finishDate, lettersAhead, percent } from "@/console/announcements/estimate";
import type { LetterRow } from "@/console/announcements/letters";

// The sheet's own arithmetic: 165 waiting at 40 a day is "about 4 days"; 431 behind that letter is
// "about 11 days", finishing around 4 Oct when today is 19 Sep (4 + 11 = 15 days on).

const row = (over: Partial<LetterRow>): LetterRow => ({
  id: "a0000000-0000-4000-8000-000000000001", list: "news", subject: "S", state: "sending", total: 0,
  sent: 0, skipped: 0, unknown: 0, waiting: 0,
  createdAt: "2026-09-10T03:00:00+00:00", queuedAt: "2026-09-11T03:35:00+00:00", stoppedAt: null, finishedAt: null,
  ...over,
});

describe("daysFor", () => {
  it.each([[0, 0], [1, 1], [40, 1], [41, 1], [60, 2], [165, 4], [431, 11]])("%i waiting is %i days", (waiting, days) => {
    expect(daysFor(waiting)).toBe(days);
  });
});

describe("lettersAhead", () => {
  const sending = row({ id: "a0000000-0000-4000-8000-000000000002", subject: "A clearer chart view", waiting: 165 });

  it("is null when nothing else is open", () => {
    expect(lettersAhead([row({ state: "done" }), row({ state: "draft", queuedAt: null })], { id: null, queuedAt: null })).toBeNull();
  });

  it("names the letter a new draft would wait behind, with its days left", () => {
    expect(lettersAhead([sending], { id: null, queuedAt: null })).toEqual({ subject: "A clearer chart view", more: 0, days: 4 });
  });

  it("adds every open letter's wait, and names the one that goes first", () => {
    const second = row({ id: "a0000000-0000-4000-8000-000000000003", subject: "Later", state: "queued", waiting: 80, queuedAt: "2026-09-12T03:00:00+00:00" });
    expect(lettersAhead([second, sending], { id: null, queuedAt: null })).toEqual({ subject: "A clearer chart view", more: 1, days: 6 });
  });

  it("for a queued letter, counts only what was queued before it, and never itself", () => {
    const mine = row({ id: "a0000000-0000-4000-8000-000000000004", state: "queued", waiting: 431, queuedAt: "2026-09-12T03:00:00+00:00" });
    const after = row({ id: "a0000000-0000-4000-8000-000000000005", state: "queued", waiting: 40, queuedAt: "2026-09-13T03:00:00+00:00" });
    expect(lettersAhead([after, mine, sending], { id: mine.id, queuedAt: mine.queuedAt })).toEqual({ subject: "A clearer chart view", more: 0, days: 4 });
  });
});

describe("finishDate", () => {
  it("is that many days on", () => {
    expect(finishDate(new Date("2026-09-19T09:02:00Z"), 15).toISOString().slice(0, 10)).toBe("2026-10-04");
  });
});

describe("percent", () => {
  it.each([[266, 431, 62], [123, 418, 29], [217, 217, 100], [0, 0, 0]])("%i of %i is %i%%", (handled, total, pct) => {
    expect(percent(handled, total)).toBe(pct);
  });
});
