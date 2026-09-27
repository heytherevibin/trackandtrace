import { describe, expect, it } from "vitest";
import { clamp, easeInOutCubic, easeOutCubic, lerp, smoothstep } from "@/components/landing/journey/scene/math";

describe("the drawing's math", () => {
  it("clamps into 0..1 by default, or the range given", () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(2)).toBe(1);
    expect(clamp(0.3)).toBe(0.3);
    expect(clamp(5, 0, 3)).toBe(3);
  });

  it("interpolates", () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
  });

  it("smoothsteps with flat ends and a half at the middle", () => {
    expect(smoothstep(0.2, 0.4, 0.1)).toBe(0);
    expect(smoothstep(0.2, 0.4, 0.5)).toBe(1);
    expect(smoothstep(0.2, 0.4, 0.3)).toBeCloseTo(0.5, 10);
  });

  it("eases on the cubic, in-out and out", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.25)).toBeCloseTo(0.0625, 10);
    expect(easeInOutCubic(0.5)).toBe(0.5);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 10);
    expect(easeOutCubic(1)).toBe(1);
  });
});
