import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CURVES, STAGGER, T, parseCurve, type CurveToken } from "@/components/landing/journey/motion-tokens";

const tokens = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");

describe("journey motion tokens", () => {
  it("keeps v3's ladder of durations and staggers", () => {
    expect(T).toEqual({ fast: 180, base: 420, slow: 760, draw: 1100 });
    expect(STAGGER).toEqual({ char: 16, row: 60, tick: 4, seg: 40, flap: 22 });
  });

  it("falls back to exactly the curves tokens.css defines", () => {
    for (const token of Object.keys(CURVES) as CurveToken[]) {
      const declared = new RegExp(`${token}:\\s*cubic-bezier\\(([^)]+)\\)`).exec(tokens)?.[1];
      expect(declared, token).toBeDefined();
      expect(declared!.split(",").map((n) => Number(n.trim()))).toEqual([...CURVES[token]]);
    }
  });

  it("reads a live cubic-bezier, and falls back when the property is empty or malformed", () => {
    expect(parseCurve(" cubic-bezier(0.1, 0.2, 0.3, 0.4)", "--ease-out")).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(parseCurve("", "--ease-out-expo")).toEqual([...CURVES["--ease-out-expo"]]);
    expect(parseCurve("cubic-bezier(1, nope, 2)", "--ease-in")).toEqual([...CURVES["--ease-in"]]);
  });
});
