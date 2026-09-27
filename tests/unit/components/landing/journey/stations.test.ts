import { describe, expect, it } from "vitest";
import { STATIONS, kmFigure } from "@/components/landing/journey/stations";

describe("the route through the landing", () => {
  it("runs DEP, 01 to 08, END, in order of kilometres, with a name for each", () => {
    expect(STATIONS.map((s) => s.code)).toEqual(["DEP", "GA", "01", "02", "03", "04", "05", "06", "07", "08", "END"]);
    expect(STATIONS.map((s) => s.km)).toEqual([0, 12, 64, 138, 212, 318, 407, 530, 644, 730, 781]);
    expect(new Set(STATIONS.map((s) => s.id)).size).toBe(STATIONS.length);
    for (const s of STATIONS) expect(s.name.length, s.id).toBeGreaterThan(0);
  });

  it("names GA for the drawn train, whose section is #anatomy", () => {
    expect(STATIONS[1]).toEqual({ id: "anatomy", code: "GA", km: 12, name: "The train, drawn" });
  });

  it("prints kilometres as three figures", () => {
    expect(kmFigure(0)).toBe("000");
    expect(kmFigure(64)).toBe("064");
    expect(kmFigure(781)).toBe("781");
  });
});
