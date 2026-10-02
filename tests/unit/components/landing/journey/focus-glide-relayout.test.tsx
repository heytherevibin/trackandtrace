import { describe, expect, it, vi } from "vitest";
import { startFocusGlide } from "@/components/landing/journey/focus-glide";
import { at, frames, glide, jump, modality, policy, pressTab, relayout, reveal, tabOnto, setUpGlideRig } from "./focus-glide-rig";
import { testContext } from "./journey-context";

// A relayout cuts a glide short too (the owner, 2026-09-28): the browser sets a glide's end as it begins, so a piece that
// grows or shrinks between the reader and the link (the live drawing pinning a frame after the Tab, a late font, a
// resize) leaves the glide landing where the link was. Taken up under the jump's bounds, only when the link moved on the
// page and the page stood on the glide's course, and carried through the journey's rebuild.

setUpGlideRig();

describe("a relayout that moves the link under its glide (the owner, 2026-09-28)", () => {
  it("takes the glide up again: the browser set its end at the Tab, and the link has moved past it", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    relayout();
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledWith({ block: "center", inline: "nearest" });
    stop();
  });

  it("takes up a resize that moves the link, and a move up the page as well as down", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    relayout(-300, "resize");
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    stop();
  });

  it("takes up a relayout before the glide's first scroll: the live drawing pins a frame after the Tab", () => {
    const stop = startFocusGlide(testContext());
    modality(policy(), true);
    pressTab();
    policy().focus();
    frames(1);
    relayout();
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    stop();
  });

  it("takes nothing up for a relayout that leaves the link where it was on the page", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    relayout(0);
    relayout(0, "resize");
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("shares the three takes with the place-keeping jumps", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    for (const [cut, times] of [[jump, 1], [() => relayout(), 2], [jump, 3], [() => relayout(), 3]] as const) {
      cut();
      frames(3);
      expect(reveal).toHaveBeenCalledTimes(times);
    }
    stop();
  });

  it("lets go once the page has held still for ten frames: a relayout after that takes nothing up", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    frames(10);
    relayout();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("carries a watched glide through the journey's rebuild, in the task that tears it down and starts it again", () => {
    const before = startFocusGlide(testContext());
    tabOnto(policy());
    relayout(); // a late font: 02's fit changes with it, and the journey rebuilds
    before();
    const after = startFocusGlide(testContext());
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    after();
  });

  it("carries its takes through the rebuild: three in all", () => {
    const before = startFocusGlide(testContext());
    tabOnto(policy());
    for (let k = 0; k < 2; k += 1) {
      jump();
      frames(3);
    }
    expect(reveal).toHaveBeenCalledTimes(2);
    before();
    const after = startFocusGlide(testContext());
    frames(3);
    jump();
    frames(3);
    relayout();
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(3);
    after();
  });

  it("carries nothing to a start in a later task, nor to one with Motion off", async () => {
    const first = startFocusGlide(testContext());
    tabOnto(policy());
    first();
    const off = startFocusGlide(testContext({ motion: false }));
    off();
    await Promise.resolve();
    const later = startFocusGlide(testContext());
    relayout();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    later();
  });
});

describe("a relayout never takes up a glide against the reader", () => {
  for (const [name, to] of [
    ["back, above where the Tab found them", 100],
    ["on, past the link's place", 3000],
  ] as const) {
    it(`does not pull back a reader who dragged out of the glide's span (${name}), though the link then moves`, () => {
      at.y = 600;
      at.box = { top: 2400, bottom: 2432 }; // 1800px down the window: its glide spans 600 to 2336
      const stop = startFocusGlide(testContext());
      tabOnto(policy());
      expect(reveal).not.toHaveBeenCalled();
      at.y = to; // a scrollbar drag: no wheel, touch or key
      window.dispatchEvent(new Event("scroll"));
      relayout();
      frames(3);
      relayout(100, "resize");
      frames(3);
      jump(); // let go: a jump after it takes nothing up either
      frames(3);
      expect(reveal).not.toHaveBeenCalled();
      stop();
    });
  }

  it("does not pull back a reader who dragged out of the glide's span, though the journey then rebuilds (review F1)", () => {
    at.y = 600;
    at.box = { top: 2400, bottom: 2432 };
    const before = startFocusGlide(testContext());
    tabOnto(policy());
    at.y = 100; // a scrollbar drag, back: no wheel, touch or key
    window.dispatchEvent(new Event("scroll"));
    before();
    const after = startFocusGlide(testContext());
    frames(3);
    jump(); // nothing carried through: a jump after it takes nothing up either
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    after();
  });

  it("lets a cut still pending go when the run pins under the glide: run.ts's to answer (review F4)", () => {
    const run = document.querySelector("#run")!;
    run.classList.remove("is-running");
    const stop = startFocusGlide(testContext());
    tabOnto(document.querySelector<HTMLAnchorElement>("#run a")!);
    jump(); // a cut, taken up two frames later
    run.classList.add("is-running"); // the run pins in the meantime
    relayout();
    frames(3);
    jump();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("is not armed by mouse focus, nor by focus returning to the window", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy(), false);
    relayout();
    frames(3);
    policy().blur();
    modality(policy(), true);
    policy().focus();
    relayout();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("leaves a station to run.ts once the run pins under the glide: its relayout is the run's to answer", () => {
    const run = document.querySelector("#run")!;
    run.classList.remove("is-running"); // a reader below the run Shift+Tabs up into it
    const stop = startFocusGlide(testContext());
    tabOnto(document.querySelector<HTMLAnchorElement>("#run a")!);
    run.classList.add("is-running");
    relayout();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("lets go on the reader's own scroll: a relayout after a wheel takes nothing up", () => {
    const stop = startFocusGlide(testContext());
    tabOnto(policy());
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 120 }));
    relayout();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });
});

// An in-page link's glide is cut short the same ways (the reviewer, 2026-10-01: a phone's toolbar resizing the window a few
// frames into a tapped link's glide), and is taken up under the same bounds, to its target's landing. Scroll anchoring is
// held off while it is watched: WebKit's stopped the glide with nothing to hear.
describe("an in-page link's glide", () => {
  /** A link to 04 above it on the page, 04 itself 1,400 px down (`at.box`, moved by relayout) with an 80 px scroll margin,
   * and its click with the glide's first scroll. */
  const tapLinkTo04 = () => {
    const section = document.getElementById("reliability")!;
    section.style.scrollMarginTop = "80px";
    section.getBoundingClientRect = () => ({ top: at.box.top - at.y, bottom: at.box.bottom - at.y }) as DOMRect;
    section.scrollIntoView = reveal;
    const link = document.createElement("a");
    link.href = "#reliability";
    document.body.prepend(link);
    window.location.hash = "#reliability"; // the browser's own navigation, which jsdom does not make
    link.click();
    glide();
    frames(1);
    return link;
  };
  const anchoring = () => document.documentElement.style.getPropertyValue("overflow-anchor");

  it("is taken up, to its target's landing, when a relayout moved the target under it", () => {
    const stop = startFocusGlide(testContext());
    tapLinkTo04();
    relayout(-240, "resize");
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledWith({ block: "start" });
    stop();
  });

  it("is taken up after a place-keeping jump, though focus never moved to its target", () => {
    const stop = startFocusGlide(testContext());
    tapLinkTo04();
    jump();
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    stop();
  });

  it("holds scroll anchoring off while it is watched, and gives it back once the page has held still", () => {
    const stop = startFocusGlide(testContext());
    expect(anchoring()).toBe("");
    tapLinkTo04();
    expect(anchoring()).toBe("none");
    frames(10);
    expect(anchoring()).toBe("");
    stop();
  });

  it("is the reader's once a finger moves on the page: nothing is taken up, and scroll anchoring is given back", () => {
    const stop = startFocusGlide(testContext());
    tapLinkTo04();
    window.dispatchEvent(new Event("touchmove"));
    expect(anchoring()).toBe("");
    relayout(-240, "resize");
    jump();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("is let go when the reader has gone elsewhere: the address names another place", () => {
    const stop = startFocusGlide(testContext());
    tapLinkTo04();
    window.location.hash = "#faq";
    jump();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("keeps a reader a drag took off its course where they are", () => {
    const stop = startFocusGlide(testContext());
    tapLinkTo04();
    at.y = 6000; // far past 04: a scrollbar drag, which sends no wheel, touch or key
    window.dispatchEvent(new Event("scroll"));
    relayout(-240, "resize");
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    expect(anchoring()).toBe("");
    stop();
  });

  it("leaves a link to a section of the running run to run.ts, and a modified click to the browser", () => {
    const stop = startFocusGlide(testContext());
    const features = document.getElementById("features")!;
    features.scrollIntoView = reveal;
    const toRun = document.createElement("a");
    toRun.href = "#features";
    const modified = document.createElement("a");
    modified.href = "#reliability";
    document.body.prepend(toRun, modified);
    document.getElementById("reliability")!.scrollIntoView = reveal;
    toRun.click();
    expect(anchoring()).toBe("");
    modified.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }));
    expect(anchoring()).toBe("");
    jump();
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("leaves a Tab's glide as it was: scroll anchoring stays the browser's", () => {
    const stop = startFocusGlide(testContext());
    const set = vi.spyOn(document.documentElement.style, "setProperty");
    tabOnto(policy());
    jump();
    frames(3);
    expect(reveal).toHaveBeenCalledWith({ block: "center", inline: "nearest" });
    expect(set).not.toHaveBeenCalledWith("overflow-anchor", "none");
    stop();
  });

  it("gives scroll anchoring back when the journey ends mid-glide", () => {
    const stop = startFocusGlide(testContext());
    tapLinkTo04();
    expect(anchoring()).toBe("none");
    stop();
    frames(1);
    expect(anchoring()).toBe("");
  });
});
