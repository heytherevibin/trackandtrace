import { describe, expect, it } from "vitest";
import { STATIONS, kmFigure, stopLeft, stopName } from "@/components/landing/journey/stations";

describe("the route through the landing", () => {
  it("runs DEP, 01 to 08, END, in order of kilometres, with a name for each", () => {
    expect(STATIONS.map((s) => s.code)).toEqual(["DEP", "01", "02", "03", "04", "05", "06", "07", "08", "END"]);
    expect(STATIONS.map((s) => s.km)).toEqual([0, 64, 138, 212, 318, 407, 530, 644, 730, 781]);
    expect(new Set(STATIONS.map((s) => s.id)).size).toBe(STATIONS.length);
    for (const s of STATIONS) expect(s.name.length, s.id).toBeGreaterThan(0);
  });

  it("spaces the stops evenly along the strip", () => {
    expect(stopLeft(0, 10)).toBe("0.000%");
    expect(stopLeft(3, 10)).toBe("33.333%");
    expect(stopLeft(9, 10)).toBe("100.000%");
  });

  it("prints kilometres as three figures", () => {
    expect(kmFigure(0)).toBe("000");
    expect(kmFigure(64)).toBe("064");
    expect(kmFigure(781)).toBe("781");
  });

  it("names every stop with its visible code first, then its name", () => {
    const byCode = (code: string) => STATIONS.find((s) => s.code === code)!;
    expect(stopName(byCode("01"))).toBe("01 · Operating principles");
    expect(stopName(byCode("DEP"))).toBe("DEP · Platform 3 · Departures");
    expect(stopName(byCode("END"))).toBe("END · Run a check");
  });
});
