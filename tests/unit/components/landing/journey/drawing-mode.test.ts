import { describe, expect, it } from "vitest";
import { modeOf, startingReasons, wantsScene, whyOf, withReason, type Reasons } from "@/components/landing/journey/drawing-mode";

const none: Reasons = new Set();

// The terminus's drawing (spec §3.C, cut down to the terminus on 2026-10-18): live unless a reason holds.
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

  it("wants the scene only when nothing holds the drawing still", () => {
    expect(wantsScene(new Set())).toBe(true);
    expect(wantsScene(new Set(["saver"]))).toBe(false);
    expect(wantsScene(new Set(["webgl"]))).toBe(false);
  });
});
