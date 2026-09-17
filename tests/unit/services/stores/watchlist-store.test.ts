import { describe, expect, it } from "vitest";
import { appendCheckLocal, mergeChecks, parseEntries, removeLocal, upsertLocal } from "@/services/stores/watchlist-store";

const point = (at: string) => ({ at, status: "WL" as const, position: 5 });
const entry = { pnr: "2345678901", label: "one", addedAt: "2026-09-10T00:00:00.000Z", checks: [point("2026-09-10T00:00:00.000Z")] };

describe("watchlist pure functions", () => {
  it("parseEntries drops invalid records and tolerates non-arrays", () => {
    expect(parseEntries("junk")).toEqual([]);
    expect(parseEntries([entry, { pnr: "x" }])).toEqual([entry]);
  });
  it("upsertLocal is immutable and prepends new entries", () => {
    const list = [entry];
    const next = upsertLocal(list, { pnr: "2345678905", label: "two" }, new Date("2026-09-17T00:00:00.000Z"));
    expect(next).toHaveLength(2);
    expect(next[0]?.pnr).toBe("2345678905");
    expect(list).toHaveLength(1);
  });
  it("upsertLocal keeps addedAt and merges the point on an existing entry", () => {
    const next = upsertLocal([entry], { pnr: entry.pnr, label: "renamed", point: point("2026-09-11T00:00:00.000Z") });
    expect(next[0]).toMatchObject({ label: "renamed", addedAt: entry.addedAt });
    expect(next[0]?.checks).toHaveLength(2);
  });
  it("appendCheckLocal ignores unknown pnrs, dedupes by time, and caps at 40", () => {
    expect(appendCheckLocal([entry], "0000000000", point("2026-09-12T00:00:00.000Z"))).toEqual([entry]);
    const same = appendCheckLocal([entry], entry.pnr, point(entry.checks[0]!.at));
    expect(same[0]?.checks).toHaveLength(1);
    const many = Array.from({ length: 45 }, (_, i) => point(`2026-08-${String((i % 28) + 1).padStart(2, "0")}T0${i % 10}:00:00.000Z`));
    expect(mergeChecks([], many)).toHaveLength(40);
  });
  it("removeLocal filters by pnr", () => {
    expect(removeLocal([entry], entry.pnr)).toEqual([]);
  });
});
