import { describe, expect, it } from "vitest";
import { keepsPlace, modeOf, startingReasons, whyOf, withReason, type Reasons } from "@/components/landing/journey/drawing-mode";

const none: Reasons = new Set();

describe("the drawing's mode (spec §3.C)", () => {
  it("is live unless a reason holds", () => {
    expect(modeOf(none)).toBe("live");
    expect(modeOf(new Set(["webgl"]))).toBe("still");
  });

  it("adds and drops reasons without touching the set it was given", () => {
    const one = withReason(none, "load", true);
    expect([...one]).toEqual(["load"]);
    expect(none.size).toBe(0);
    expect(withReason(one, "load", false).size).toBe(0);
  });

  it("names its reasons in the spec's order", () => {
    expect(whyOf(new Set(["load", "motion", "saver"]))).toBe("motion saver load");
    expect(whyOf(none)).toBe("");
  });

  it("starts from Motion, Data Saver and this session's quality floor", () => {
    expect([...startingReasons({ motion: true, saver: false, quality: null })]).toEqual([]);
    expect(whyOf(startingReasons({ motion: false, saver: true, quality: "still" }))).toBe("motion saver quality");
    expect(whyOf(startingReasons({ motion: true, saver: false, quality: "2" }))).toBe("");
  });

  it("keeps a reader inside the chapter at its start, only when its height changed", () => {
    const inside = { top: -300, bottom: 900, height: 1200 };
    expect(keepsPlace(inside, 1500, 800)).toBe(true);
    expect(keepsPlace(inside, 1200, 800)).toBe(false);
    expect(keepsPlace({ top: 0, bottom: 1200, height: 1200 }, 1500, 800)).toBe(false); // at its start already
    expect(keepsPlace({ top: -1000, bottom: 200, height: 1200 }, 1500, 800)).toBe(false); // leaving it
  });
});
