import { describe, expect, it } from "vitest";
import { consoleMessages } from "@/console/messages";
import { accountsRow, auditWhen, checksRow, monthQuota, primarySourceRow, resetsOn, storeRow } from "@/console/overview/overview";
import type { Fuse } from "@/console/sources/source-plate";
import type { BreakerState } from "@/services/breaker";

// ---------------------------------------------------------------------------
// Module 01's figures, shaped from reads other modules already make.
//
// Overview is a summary of what is RECORDED. Each row below says the one thing its
// read can support — and when the read failed, it says that, never the resting
// value. "Answering" drawn off a store nobody could reach is the failure #84 was
// written against, and this page is where an operator would believe it most.
// ---------------------------------------------------------------------------

const m = consoleMessages.overview;
const NOW = new Date("2026-09-28T09:00:00Z"); // 14:30 IST

const CLOSED: BreakerState = { known: true, open: false, retryAfterSeconds: null, openedBy: null, failures: 0, asks: 0, trips: 0 };
const UNKNOWN: BreakerState = { ...CLOSED, known: false };
const openFor = (seconds: number, by: "provider" | "endpoint"): BreakerState => ({ ...CLOSED, open: true, retryAfterSeconds: seconds, openedBy: by });

function fuses(pnr: BreakerState, availability: BreakerState = CLOSED, route: BreakerState = CLOSED): readonly Fuse[] {
  return [
    { caller: "pnr", state: pnr },
    { caller: "availability", state: availability },
    { caller: "route", state: route },
  ];
}

describe("checksRow", () => {
  it("answers while today's live-check budget has room", () => {
    expect(checksRow({ configured: true, used: 157, limit: 300 })).toMatchObject({ lamp: "lit", word: m.service.words.answering, notes: [] });
  });

  it("is degraded once the budget is spent, and says what travellers get instead", () => {
    expect(checksRow({ configured: true, used: 300, limit: 300 })).toMatchObject({ lamp: "half", word: m.service.words.degraded, notes: [m.service.budgetUsed] });
  });

  it("cannot say when the budget could not be read — an unread counter is not a quiet day", () => {
    expect(checksRow({ configured: true, used: null, limit: 300 })).toMatchObject({ lamp: "hollow", word: m.service.words.cannotSay, notes: [m.service.budgetUnknown] });
  });

  it("answers with no budget at all when the deployment asks no third-party source", () => {
    expect(checksRow({ configured: false, used: null, limit: 300 })).toMatchObject({ lamp: "lit", word: m.service.words.answering, notes: [] });
  });
});

describe("primarySourceRow", () => {
  it("answers when every caller's fuse is closed", () => {
    expect(primarySourceRow({ configured: true, fuses: fuses(CLOSED), now: NOW })).toMatchObject({ lamp: "lit", word: m.service.words.answering, notes: [] });
  });

  it("is down, once, with the time it may be asked again, when the provider-wide fuse is open", () => {
    // The provider fuse opens every caller at once: one sentence, not three copies of it.
    const provider = openFor(660, "provider");
    expect(primarySourceRow({ configured: true, fuses: fuses(provider, provider, provider), now: NOW })).toMatchObject({
      lamp: "ringed",
      word: m.service.words.down,
      notes: [m.service.openUntil("14:41")],
    });
  });

  it("is degraded when one caller's fuse is open, and names that caller", () => {
    expect(primarySourceRow({ configured: true, fuses: fuses(CLOSED, openFor(660, "endpoint")), now: NOW })).toMatchObject({
      lamp: "half",
      word: m.service.words.degraded,
      notes: [m.service.openUntilFor(consoleMessages.sources.fuses.caller.availability, "14:41")],
    });
  });

  it("is down when every caller's own fuse is open, naming each", () => {
    const row = primarySourceRow({ configured: true, fuses: fuses(openFor(60, "endpoint"), openFor(60, "endpoint"), openFor(60, "endpoint")), now: NOW });
    expect(row.word).toBe(m.service.words.down);
    expect(row.notes).toHaveLength(3);
  });

  it("cannot say when any fuse could not be read, rather than calling the rest 'answering'", () => {
    expect(primarySourceRow({ configured: true, fuses: fuses(CLOSED, UNKNOWN), now: NOW })).toMatchObject({
      lamp: "hollow",
      word: m.service.words.cannotSay,
      notes: [m.service.fusesUnknown],
    });
  });

  it("is not configured when the deployment asks no third-party source", () => {
    expect(primarySourceRow({ configured: false, fuses: [], now: NOW })).toMatchObject({ lamp: "hollow", word: m.service.words.notConfigured, notes: [m.service.noSource] });
  });

  it("says the fuse is open without a time when the store gave no rest to count", () => {
    const open: BreakerState = { ...CLOSED, open: true, openedBy: "endpoint" };
    expect(primarySourceRow({ configured: true, fuses: fuses(open), now: NOW }).notes).toEqual([m.service.openFor(consoleMessages.sources.fuses.caller.pnr)]);
  });
});

describe("storeRow and accountsRow", () => {
  it("say connected, not answering, or that there is no shared store to connect to", () => {
    expect(storeRow("connected")).toMatchObject({ lamp: "lit", word: m.service.words.connected });
    expect(storeRow("unreachable")).toMatchObject({ lamp: "ringed", word: m.service.words.notAnswering });
    expect(storeRow("local")).toMatchObject({ lamp: "hollow", word: m.service.words.thisInstance, notes: [m.service.thisInstanceNote] });
  });

  it("say the same three things of accounts", () => {
    expect(accountsRow("connected")).toMatchObject({ lamp: "lit", word: m.service.words.connected });
    expect(accountsRow("unreachable")).toMatchObject({ lamp: "ringed", word: m.service.words.notAnswering });
    expect(accountsRow("notConfigured")).toMatchObject({ lamp: "hollow", word: m.service.words.notConfigured });
  });
});

describe("monthQuota", () => {
  it("totals the month against the plan and counts the days it could not read", () => {
    const history = [
      { day: "2026-09-01", requests: 100 },
      { day: "2026-09-02", requests: null },
      { day: "2026-09-03", requests: 50 },
    ];
    expect(monthQuota(history, 100_000)).toEqual({ used: 150, plan: 100_000, share: 0.0015, unreadDays: 1 });
  });

  it("has no figure when no day of the month could be read", () => {
    expect(monthQuota([{ day: "2026-09-01", requests: null }], 100_000)).toBeNull();
  });

  it("caps the meter at full, because a plan can be overspent but a bar cannot be longer than itself", () => {
    expect(monthQuota([{ day: "2026-09-01", requests: 120_000 }], 100_000)?.share).toBe(1);
  });
});

describe("resetsOn", () => {
  it("names the 1st of the next month in India", () => {
    expect(resetsOn(NOW)).toBe("1 Oct");
  });

  it("uses India's month, not the server's: 23:00 UTC on 31 Oct is already November in IST", () => {
    expect(resetsOn(new Date("2026-10-31T23:00:00Z"))).toBe("1 Dec");
  });

  it("rolls the year over in December", () => {
    expect(resetsOn(new Date("2026-12-15T06:00:00Z"))).toBe("1 Jan");
  });
});

describe("auditWhen", () => {
  it("gives the time alone for an entry from today", () => {
    expect(auditWhen("2026-09-28T13:58:00+05:30", NOW)).toBe("13:58");
  });

  it("gives the day too for an older one, so yesterday's 13:41 is not read as today's", () => {
    // "Sept", as CLDR's en-IN short month gives it — the same month the rail's build line and the
    // audit log already print (console-rail.tsx's own note), not a second hand-rolled formatter.
    expect(auditWhen("2026-09-26T13:41:00+05:30", NOW)).toBe("26 Sept, 13:41");
  });
});
