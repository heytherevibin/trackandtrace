import { describe, expect, it } from "vitest";
import { planMerge, shouldPromptMerge } from "@/services/stores/watchlist-merge";

const check = (at: string) => ({ at, status: "WL" as const, position: 5 });
const entry = (pnr: string, checks: ReturnType<typeof check>[]) => ({ pnr, label: pnr, addedAt: "2026-09-10T00:00:00.000Z", checks });

describe("planMerge", () => {
  it("creates local-only entries, updates entries with novel checks, leaves identical ones", () => {
    const local = [entry("2345678901", [check("2026-09-11T00:00:00.000Z")]), entry("2345678905", [check("2026-09-12T00:00:00.000Z")]), entry("2345678908", [])];
    const server = [entry("2345678905", [check("2026-09-10T00:00:00.000Z")]), entry("2345678908", [])];
    const plan = planMerge(local, server);
    expect(plan.create.map((e) => e.pnr)).toEqual(["2345678901"]);
    expect(plan.update.map((e) => e.pnr)).toEqual(["2345678905"]);
    expect(plan.update[0]?.checks).toHaveLength(2);
    expect(plan.unchanged).toEqual(["2345678908"]);
  });
});

describe("shouldPromptMerge", () => {
  const now = new Date("2026-09-17T00:00:00.000Z");
  it("prompts with no stored state, never after opting out, and again after a week", () => {
    expect(shouldPromptMerge(null, now)).toBe(true);
    expect(shouldPromptMerge({ never: true }, now)).toBe(false);
    expect(shouldPromptMerge({ snoozedAt: "2026-09-15T00:00:00.000Z" }, now)).toBe(false);
    expect(shouldPromptMerge({ snoozedAt: "2026-09-01T00:00:00.000Z" }, now)).toBe(true);
  });
});
