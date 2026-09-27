import { describe, expect, it } from "vitest";
import { modeOf, pastShift, placeAfter, readerPlace, startingReasons, wantsScene, whyOf, withReason, type Reasons } from "@/components/landing/journey/drawing-mode";

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
    expect([...startingReasons({ motion: true, saver: false, quality: null, place: false })]).toEqual([]);
    expect(whyOf(startingReasons({ motion: false, saver: true, quality: "still", place: false }))).toBe("motion saver quality");
    expect(whyOf(startingReasons({ motion: true, saver: false, quality: "2", place: false }))).toBe("");
  });

  it("names place last, and starts with it when the reader is below the chapter (J5-2)", () => {
    expect(whyOf(startingReasons({ motion: false, saver: false, quality: null, place: true }))).toBe("motion place");
  });

  it("wants the scene only when nothing but the reader's place holds the drawing still", () => {
    expect(wantsScene(new Set())).toBe(true);
    expect(wantsScene(new Set(["place"]))).toBe(true);
    expect(wantsScene(new Set(["place", "saver"]))).toBe(false);
    expect(wantsScene(new Set(["webgl"]))).toBe(false);
  });

  it("places the reader once the chapter changed height under them (J5-3)", () => {
    const at = { scrollY: 5000, viewport: 800, masthead: 64 };
    // the chapter's top is visible: the change lands below the reader
    expect(placeAfter({ top: 100, bottom: 4260, height: 4160 }, { top: 100, height: 900 }, at)).toBeNull();
    // inside it: back to its start, under the masthead
    expect(placeAfter({ top: -2000, bottom: 2160, height: 4160 }, { top: -2000, height: 900 }, at)).toBe(5000 - 2000 - 64);
    // past it: by exactly the change, so what they read stays put
    expect(placeAfter({ top: -5000, bottom: -840, height: 4160 }, { top: -5000, height: 900 }, at)).toBe(5000 - 3260);
    // no change, no move
    expect(placeAfter({ top: -2000, bottom: 2160, height: 4160 }, { top: -2000, height: 4160.5 }, at)).toBeNull();
  });

  it("judges the reader against a piece of the page by one rule (J5-3, shared by J6-4)", () => {
    // its top visible, or within 8px above: above it, and a change lands below them
    expect(readerPlace({ top: 0, bottom: 4000 }, 900)).toBe("above");
    expect(readerPlace({ top: -8, bottom: 4000 }, 900)).toBe("above");
    // over half the window still in it: inside
    expect(readerPlace({ top: -9, bottom: 4000 }, 900)).toBe("inside");
    expect(readerPlace({ top: -3000, bottom: 451 }, 900)).toBe("inside");
    // its foot within the window's top half: past it, reading what follows
    expect(readerPlace({ top: -3000, bottom: 450 }, 900)).toBe("past");
    expect(readerPlace({ top: -3000, bottom: 120 }, 900)).toBe("past");
    expect(readerPlace({ top: -3000, bottom: -500 }, 900)).toBe("past");
  });

  it("moves a reader past a piece by exactly its change, and nobody else", () => {
    expect(pastShift({ top: -900, bottom: 16 }, -77, 900)).toBe(-77); // #principles at 80 px, the pin's foot at 16 px
    expect(pastShift({ top: -900, bottom: 16 }, 0.5, 900)).toBe(0); // no change worth a move
    expect(pastShift({ top: -900, bottom: 600 }, -77, 900)).toBe(0); // inside: the piece's own business
    expect(pastShift({ top: 40, bottom: 900 }, -77, 900)).toBe(0); // above: the change lands below
  });
});
