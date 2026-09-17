import { describe, expect, it } from "vitest";
import { parseRecent, pushRecent } from "@/services/stores/recent-store";

const item = (pnr: string) => ({ pnr, checkedAt: "2026-09-17T06:30:00.000Z" });

describe("recent checks", () => {
  it("moves a repeated pnr to the front without duplicates", () => {
    const list = pushRecent([item("2345678901"), item("2345678905")], item("2345678905"));
    expect(list.map((r) => r.pnr)).toEqual(["2345678905", "2345678901"]);
  });
  it("caps the list and returns a new array", () => {
    const list = Array.from({ length: 8 }, (_, i) => item(`234567890${i}`));
    const next = pushRecent(list, item("2345678909"), 8);
    expect(next).toHaveLength(8);
    expect(next[0]?.pnr).toBe("2345678909");
    expect(next).not.toBe(list);
  });
  it("drops malformed stored records", () => {
    expect(parseRecent([item("2345678901"), { pnr: "12" }, "x"])).toHaveLength(1);
  });
});
