import { describe, expect, it } from "vitest";
import { checkedAgo, lastCheck, restoreAt, trendLabel } from "@/app/(site)/watchlist/watchlist-format";
import type { HistoryPoint, WatchlistEntry } from "@/types/domain";

const at = (minute: number): string => new Date(Date.UTC(2026, 8, 17, 6, minute)).toISOString();
const wl = (position: number, minute: number): HistoryPoint => ({ at: at(minute), status: "WL", position });
const rac = (position: number, minute: number): HistoryPoint => ({ at: at(minute), status: "RAC", position });
const cnf = (minute: number): HistoryPoint => ({ at: at(minute), status: "CNF", position: null });

describe("trendLabel", () => {
  it("reads waitlist positions as bare figures", () => {
    expect(trendLabel([wl(11, 1), wl(8, 2), wl(5, 3)])).toBe("11 → 8 → 5");
  });

  it("labels RAC and other statuses", () => {
    expect(trendLabel([rac(4, 1), rac(1, 2)])).toBe("RAC 4 → RAC 1");
    expect(trendLabel([wl(3, 1), rac(2, 2), cnf(3)])).toBe("3 → RAC 2 → Confirmed");
  });

  it("collapses repeated points and needs more than one distinct point", () => {
    expect(trendLabel([cnf(1), cnf(2), cnf(3)])).toBeNull();
    expect(trendLabel([wl(9, 1), wl(9, 2), wl(7, 3), wl(7, 4)])).toBe("9 → 7");
    expect(trendLabel([])).toBeNull();
  });

  it("keeps only the last three distinct points", () => {
    expect(trendLabel([wl(20, 1), wl(15, 2), wl(11, 3), wl(8, 4), wl(5, 5)])).toBe("11 → 8 → 5");
  });
});

describe("checkedAgo", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");
  it("reads like the sheet: just now, minutes, hours, yesterday, days", () => {
    expect(checkedAgo("2026-09-17T11:59:30.000Z", now)).toBe("Just now");
    expect(checkedAgo("2026-09-17T12:00:30.000Z", now)).toBe("Just now");
    expect(checkedAgo("2026-09-17T11:48:00.000Z", now)).toBe("12 min ago");
    expect(checkedAgo("2026-09-17T11:00:00.000Z", now)).toBe("1 h ago");
    expect(checkedAgo("2026-09-16T10:00:00.000Z", now)).toBe("Yesterday");
    expect(checkedAgo("2026-09-14T12:00:00.000Z", now)).toBe("3 days ago");
  });
});

describe("lastCheck and restoreAt", () => {
  const entry = (pnr: string): WatchlistEntry => ({ pnr, label: pnr, addedAt: at(0), checks: [cnf(1), wl(4, 2)] });

  it("returns the latest check or null", () => {
    expect(lastCheck(entry("2345678901"))).toEqual(wl(4, 2));
    expect(lastCheck({ ...entry("2345678901"), checks: [] })).toBeNull();
  });

  it("puts an entry back where it was without mutating the list", () => {
    const list = [entry("2345678901"), entry("2345678903")];
    const back = restoreAt(list, 1, entry("2345678905"));
    expect(back.map((e) => e.pnr)).toEqual(["2345678901", "2345678905", "2345678903"]);
    expect(list).toHaveLength(2);
    expect(restoreAt(list, 9, entry("2345678905")).map((e) => e.pnr)).toEqual(["2345678901", "2345678903", "2345678905"]);
  });
});
