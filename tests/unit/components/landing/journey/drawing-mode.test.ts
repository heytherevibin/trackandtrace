import { describe, expect, it } from "vitest";
import { modeOf, pastShift, placeAfter, placeInProportion, readerPlace, startingReasons, wantsScene, whyOf, withReason, type Reasons } from "@/components/landing/journey/drawing-mode";

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

  it("with the piece's shape unchanged (a resize), keeps a reader inside it the same fraction through it", () => {
    // the live pin, 520vh: 2,064 px into its 3,424 px range in a window 800 tall, then 2,584 px in one 600 tall
    const at = { scrollY: 5000, viewport: 800, viewportAfter: 600, masthead: 64 };
    expect(placeAfter({ top: -2000, bottom: 2160, height: 4160 }, { top: -2000, height: 3120 }, at, "same")).toBe(Math.round(2936 + (2064 / 3424) * 2584));
    // a change of shape still lands them on its start; and above and past it are the same either way
    expect(placeAfter({ top: -2000, bottom: 2160, height: 4160 }, { top: -2000, height: 3120 }, at)).toBe(2936);
    expect(placeAfter({ top: 100, bottom: 4260, height: 4160 }, { top: 100, height: 3120 }, at, "same")).toBeNull();
    expect(placeAfter({ top: -5000, bottom: -840, height: 4160 }, { top: -5000, height: 3120 }, at, "same")).toBe(5000 - 1040);
  });

  it("measures the range from where the pin takes hold, before and after, when that is not under the masthead", () => {
    // the live pin in its list layout on a phone: its sticky top the copy's height above the masthead's foot, -168 in a
    // window 844 tall and -162 in one 660 tall (the copy's top padding is in vh). Its range 1,816 to 4,433 (2,617 long),
    // the reader 1,309 into it; then 1,810 to 3,826 (2,016 long). From the masthead (65) it ran 1,583 to 4,433 and landed
    // them at 2,797: 0.0106 of the range short.
    const at = { scrollY: 3125, viewport: 844, viewportAfter: 660, masthead: 65, landing: -168, landingAfter: -162 };
    const before = { top: 1648 - 3125, bottom: 5277 - 3125, height: 3629 };
    const after = { top: 1648 - 3125, height: 2838 };
    expect(placeAfter(before, after, at, "same")).toBe(Math.round(1810 + (1309 / 2617) * 2016));
    // a change of shape still lands them on its start, under the masthead
    expect(placeAfter(before, after, at)).toBe(1648 - 65);
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

  // A resize keeps a reader inside a piece the same fraction of the way through it (the owner, 2026-09-29). Its range
  // runs from its start (its top under the masthead) to its foot at the window's foot: 1000 to 4000 here, in a window
  // 900 tall, the piece's top 1080 in the page and its landing 80.
  const read = { top: 1080, bottom: 4900, landing: 80, viewport: 900 } as const;

  it("keeps a reader the same fraction through a piece a resize shrank", () => {
    // the window 700 tall: the piece's range 1000 to 3000
    const shrunk = { top: 1080, bottom: 3700, landing: 80, viewport: 700 } as const;
    expect(placeInProportion(read, shrunk, 1000)).toBe(1000); // 0: its start
    expect(placeInProportion(read, shrunk, 1750)).toBe(1500); // 0.25
    expect(placeInProportion(read, shrunk, 2800)).toBe(2200); // 0.6
    expect(placeInProportion(read, shrunk, 3700)).toBe(2800); // 0.9
    expect(placeInProportion(read, shrunk, 4000)).toBe(3000); // 1: its foot at the window's
  });

  it("keeps a reader the same fraction through a piece a resize grew, wherever its top now stands", () => {
    // wider and taller: the text above it reflowed (its top 40 higher) and its range 4000 long, from 960 to 4960
    const grown = { top: 1040, bottom: 5960, landing: 80, viewport: 1000 } as const;
    expect(placeInProportion(read, grown, 1000)).toBe(960);
    expect(placeInProportion(read, grown, 1750)).toBe(1960);
    expect(placeInProportion(read, grown, 2800)).toBe(3360);
    expect(placeInProportion(read, grown, 3700)).toBe(4560);
    expect(placeInProportion(read, grown, 4000)).toBe(4960);
  });

  it("never lands a reader short of the piece's start", () => {
    // not a place readerPlace calls inside (its top would still be in the window), so only ever a clamp
    expect(placeInProportion(read, { top: 1080, bottom: 3700, landing: 80, viewport: 700 }, 990)).toBe(1000);
  });

  it("keeps a reader beyond the range's end, its foot in the window, the same distance from that foot", () => {
    // 4300: the piece's foot 600 down the window (inside by readerPlace: over half the window is still in it)
    expect(placeInProportion(read, { top: 1080, bottom: 3700, landing: 80, viewport: 700 }, 4300)).toBe(3100);
    expect(placeInProportion(read, { top: 1040, bottom: 5960, landing: 80, viewport: 1000 }, 4300)).toBe(5360);
    // never back inside its range: a window now shorter than the foot's distance, and a piece now short, land on its end
    expect(placeInProportion(read, { top: 1080, bottom: 1500, landing: 80, viewport: 300 }, 4300)).toBe(1200);
  });

  it("never sends a reader beyond the range's end back inside it when the window gets shorter (review, I1)", () => {
    // 1 px past the end of a window 900 tall; the window 700 tall: the foot's distance (899) would be 199 px short
    const shrunk = { top: 1080, bottom: 3700, landing: 80, viewport: 700 } as const;
    expect(placeInProportion(read, shrunk, 4001)).toBe(3000);
    expect(placeInProportion(read, shrunk, 4000)).toBe(3000); // and continuous with the end itself
  });

  it("lands a reader on the piece's start when it is no taller than the window, before the resize or after it", () => {
    // before: a piece 800 tall in a window 900 tall has no range to be a fraction of
    expect(placeInProportion({ top: 1080, bottom: 1880, landing: 80, viewport: 900 }, { top: 1080, bottom: 3700, landing: 80, viewport: 700 }, 1200)).toBe(1000);
    // after: shrunk to fit its window
    expect(placeInProportion(read, { top: 1080, bottom: 1700, landing: 80, viewport: 700 }, 2800)).toBe(1000);
  });

  it("lands a reader on the piece's own start, not its timeline's, when there is no range", () => {
    // 02: its timeline starts under the masthead (64), its start lands at its scroll margin (80)
    const plain = { top: 1080, bottom: 1700, landing: 64, viewport: 700, start: 80 } as const;
    expect(placeInProportion({ ...read, landing: 64, start: 80 }, plain, 2800)).toBe(1000);
  });
});
