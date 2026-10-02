import { describe, expect, it, vi } from "vitest";
import { startFocusGlide } from "@/components/landing/journey/focus-glide";
import { followGlide } from "@/components/landing/journey/glide-follower";
import { at, frames, glide, jump, policy, relayout, reveal, tabOnto, setUpGlideRig } from "./focus-glide-rig";
import { testContext } from "./journey-context";

setUpGlideRig();

/** The browser's glide goes on: a scroll step and a frame, `n` times. */
const gliding = (n: number) => {
  for (let k = 0; k < n; k += 1) {
    glide();
    frames(1);
  }
};

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
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(20_000); // a page long enough to land it
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
    gliding(3); // the browser's glide goes on to the end it set
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

  // WebKit, its glide stopped by the journey's rebuild in that frame, now and then begins none for the take-up asked of
  // it: the page stays where it was, 4,600 px short of 08. Asked again, as a cut is, within the three takes.
  it("is asked for again when the browser begins no glide for a take-up: six still frames, and never past three takes", () => {
    const stop = startFocusGlide(testContext());
    tapLinkTo04();
    jump();
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    frames(6); // the page has not moved since
    frames(2);
    expect(reveal).toHaveBeenCalledTimes(2);
    frames(8);
    expect(reveal).toHaveBeenCalledTimes(3);
    frames(30);
    expect(reveal).toHaveBeenCalledTimes(3);
    expect(anchoring()).toBe("");
    stop();
  });

  it("is asked for once when the browser does begin the glide it was asked for", () => {
    const stop = startFocusGlide(testContext());
    tapLinkTo04();
    jump();
    frames(3);
    gliding(12);
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

  // A scrollbar's drag sends no wheel, touch, key or press, and anywhere short of the target it stands "on the glide's
  // course": told from the glide by how the page moves (followGlide), three frames of it (the review, 2026-10-02).
  it("is the reader's once a scrollbar's drag holds the page still short of its end: a resize then takes nothing up", () => {
    const stop = startFocusGlide(testContext());
    tapLinkTo04();
    at.y = 400; // the bar, dragged on toward 04 and held there
    window.dispatchEvent(new Event("scroll"));
    frames(4);
    expect(anchoring()).toBe("");
    relayout(-240, "resize");
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("is the reader's once a scrollbar's drag takes the page back up it, on its course or not", () => {
    const stop = startFocusGlide(testContext());
    tapLinkTo04();
    glide(300);
    frames(1);
    for (let k = 0; k < 3; k += 1) {
      glide(-7);
      frames(1);
    }
    expect(anchoring()).toBe("");
    relayout(-240, "resize");
    frames(3);
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  // The take-up came two frames after a cut, the third doubt a frame after that: a hand that stopped as the cut landed
  // was carried to the target (the re-review, 2026-10-02). Nothing is taken up while a doubt stands.
  it("takes nothing up while a doubt stands: a hand that stops as the resize lands is let go a frame later", () => {
    const stop = startFocusGlide(testContext());
    tapLinkTo04();
    at.y = 400; // the bar, moved once and held; the resize lands with it
    window.dispatchEvent(new Event("scroll"));
    frames(1);
    relayout(-240, "resize");
    frames(6);
    expect(reveal).not.toHaveBeenCalled();
    expect(anchoring()).toBe("");
    stop();
  });

  it("takes the glide up once its doubt clears: a frame the scroll did not advance in, then on it goes", () => {
    const stop = startFocusGlide(testContext());
    tapLinkTo04();
    relayout(-240, "resize");
    frames(1); // no advance this frame: a doubt
    expect(reveal).not.toHaveBeenCalled();
    gliding(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    stop();
  });

  // A click whose default was prevented may glide nowhere (its own handler did something else); the router's links arrive
  // so too, and do glide. Watched, but nothing is taken up for it until the page has moved toward its target.
  it("takes nothing up for a click that glided nowhere, its default prevented", () => {
    const stop = startFocusGlide(testContext());
    const section = document.getElementById("reliability")!;
    section.style.scrollMarginTop = "80px";
    section.getBoundingClientRect = () => ({ top: at.box.top - at.y, bottom: at.box.bottom - at.y }) as DOMRect;
    section.scrollIntoView = reveal;
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(20_000);
    const link = document.createElement("a");
    link.href = "#reliability";
    link.addEventListener("click", (event) => event.preventDefault());
    document.body.prepend(link);
    window.location.hash = "#reliability";
    link.click();
    frames(5);
    relayout(-240, "resize");
    jump();
    frames(12);
    expect(reveal).not.toHaveBeenCalled();
    expect(anchoring()).toBe("");
    stop();
  });

  it("takes a prevented click's glide up once the page has moved toward its target, the address naming it already", () => {
    const stop = startFocusGlide(testContext());
    const section = document.getElementById("reliability")!;
    section.style.scrollMarginTop = "80px";
    section.getBoundingClientRect = () => ({ top: at.box.top - at.y, bottom: at.box.bottom - at.y }) as DOMRect;
    section.scrollIntoView = reveal;
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(20_000);
    const link = document.createElement("a");
    link.href = "#reliability";
    link.addEventListener("click", (event) => event.preventDefault());
    document.body.prepend(link);
    window.location.hash = "#reliability";
    link.click();
    frames(3);
    relayout(-240, "resize"); // a cut before the page has moved: held until it does
    frames(2);
    expect(reveal).not.toHaveBeenCalled();
    gliding(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    stop();
  });

  it("takes the router's own link up though a jump lands before its glide has moved the page: its click changed the address", () => {
    const stop = startFocusGlide(testContext());
    const section = document.getElementById("reliability")!;
    section.style.scrollMarginTop = "80px";
    section.getBoundingClientRect = () => ({ top: at.box.top - at.y, bottom: at.box.bottom - at.y }) as DOMRect;
    section.scrollIntoView = reveal;
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(20_000);
    const link = document.createElement("a");
    link.href = "#reliability";
    link.addEventListener("click", (event) => event.preventDefault());
    document.body.prepend(link);
    window.location.hash = "";
    link.click();
    window.location.hash = "#reliability"; // the router pushes the address, and glides a few frames on
    frames(2);
    jump(); // a place-keeping jump, before that glide has moved the page: it ends with it
    frames(3);
    expect(reveal).toHaveBeenCalledTimes(1);
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

describe("a glide, followed frame by frame (followGlide)", () => {
  /** A glide of `frames` frames from 1,000 to 9,000, eased in and out, 16 ms a frame: where it stands at each. */
  const eased = (frames: number): readonly number[] => Array.from({ length: frames }, (_, k) => 1000 + 8000 * (0.5 - Math.cos((Math.PI * (k + 1)) / frames) / 2));
  const follow = (ys: readonly number[], ms = 16): readonly boolean[] => {
    const follower = followGlide(1000, 9000);
    follower.step(1000, 0); // the frame it began in
    return ys.map((y, k) => follower.step(y, (k + 1) * ms));
  };

  it("follows the browser's own glide to its end, slow (150 frames) or quick (10), easing in and out", () => {
    expect(follow(eased(150)).every(Boolean)).toBe(true);
    expect(follow(eased(10)).every(Boolean)).toBe(true);
  });

  it("follows it through a frame or two the scroll did not advance in, and a frame three times as long", () => {
    const ys = eased(60);
    const stalled = [...ys.slice(0, 20), ys[19]!, ys[19]!, ...ys.slice(22)];
    expect(follow(stalled).every(Boolean)).toBe(true);
    const follower = followGlide(1000, 9000);
    const times = ys.map((_, k) => (k + 1) * 16 + (k >= 30 ? 32 : 0)); // frame 30 took 48 ms, and the glide went on through it
    const late = ys.map((y, k) => (k === 29 ? ys[27]! : y)); // what the page saw before it
    expect(late.map((y, k) => follower.step(y, times[k]!)).every(Boolean)).toBe(true);
  });

  it("knows a drag on toward the end by its crawl far from it: three frames, and the page is the reader's", () => {
    // three frames of the glide, then the bar: 400 px on in a frame, then 7 px a frame
    const ys = [...eased(150).slice(0, 3), 1400, 1407, 1414, 1421];
    expect(follow(ys)).toEqual([true, true, true, true, true, true, false]);
  });

  it("knows a drag back up the page, and a page held still short of the end", () => {
    expect(follow([1300, 1293, 1286, 1279])).toEqual([true, true, true, false]);
    expect(follow([1300, 1300, 1300, 1300])).toEqual([true, true, true, false]);
  });

  it("doubts nothing near the end: the glide's own easing out, and its rest there", () => {
    expect(follow([5000, 8950, 8950.2, 8950.3, 8950.3, 8950.3, 9000, 9000]).every(Boolean)).toBe(true);
  });

  it("says while a doubt stands, and that it clears with the next frame of the glide", () => {
    const follower = followGlide(1000, 9000);
    follower.step(1300, 16);
    expect(follower.doubting()).toBe(false);
    follower.step(1300, 32);
    expect(follower.doubting()).toBe(true);
    follower.step(1900, 48);
    expect(follower.doubting()).toBe(false);
  });

  it("says once the page has moved toward the end: a glide did begin", () => {
    const follower = followGlide(1000, 9000);
    follower.step(1000, 16);
    expect(follower.begun()).toBe(false);
    follower.step(1002, 32);
    expect(follower.begun()).toBe(true);
  });

  // Settled for the reader, it let a real glide go: WebKit's, slowing through the resize's long frame far from its end,
  // is doubted for that frame, and the run's place-keeping jump lands in it (3 runs in 3,440 left short of 07 and 08).
  it("ends a doubt a place-keeping jump lands on: the glide ended with the jump, whoever was moving the page", () => {
    const follower = followGlide(1000, 9000);
    follower.step(1300, 16);
    follower.step(1300, 32); // a doubt
    follower.jumped();
    expect(follower.doubting()).toBe(false);
    expect([follower.step(700, 48), follower.step(700, 64), follower.step(700, 80), follower.step(700, 96)]).toEqual([true, true, true, true]);
  });

  it("takes a place-keeping jump's move for no one's: the glide ended with it, and the page standing still is no drag", () => {
    const follower = followGlide(1000, 9000);
    expect(follower.step(1300, 16)).toBe(true);
    follower.jumped();
    expect([follower.step(700, 32), follower.step(700, 48), follower.step(700, 64), follower.step(700, 80), follower.step(700, 96)]).toEqual([true, true, true, true, true]);
  });
});
