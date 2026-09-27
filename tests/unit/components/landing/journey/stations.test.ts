import { describe, expect, it } from "vitest";
import { STATIONS, kmFigure, stopName, stopTop } from "@/components/landing/journey/stations";

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

  it("spaces the stops evenly down the rail, the first at its top and the last a stop's height from its foot", () => {
    expect(stopTop(0, 10)).toBe("calc((100% - var(--stop-h)) * 0.0000)");
    expect(stopTop(3, 10)).toBe("calc((100% - var(--stop-h)) * 0.3333)");
    expect(stopTop(9, 10)).toBe("calc((100% - var(--stop-h)) * 1.0000)");
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
