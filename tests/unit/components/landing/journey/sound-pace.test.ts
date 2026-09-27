import { describe, expect, it } from "vitest";
import { START_PACE, paceStep } from "@/components/landing/journey/sound-pace";

describe("the clack's pace", () => {
  it("stays silent until 120px have passed", () => {
    const a = paceStep(START_PACE, 70, 1_000, 0.5);
    expect(a.level).toBeNull();
    const b = paceStep(a.pace, -60, 1_100, 0.5);
    expect(b.level).toBeCloseTo(0.12);
    expect(b.pace).toEqual({ travelled: 0, lastClack: 1_100 });
  });
  it("never clacks twice within 80ms, and keeps counting meanwhile", () => {
    const first = paceStep(START_PACE, 200, 1_000, 1);
    const soon = paceStep(first.pace, 200, 1_050, 1);
    expect(soon.level).toBeNull();
    expect(soon.pace.travelled).toBe(200);
  });
  it("grows louder with speed, to 0.32 at most", () => {
    expect(paceStep(START_PACE, 500, 1_000, 10).level).toBe(0.32);
  });
});
