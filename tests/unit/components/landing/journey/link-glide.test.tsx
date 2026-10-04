import { describe, expect, it, vi } from "vitest";
import { startFocusGlide } from "@/components/landing/journey/focus-glide";
import { at, frames, glide, jump, relayout, reveal, setUpGlideRig } from "./focus-glide-rig";
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

  it("keeps a reader a drag took far past its target where they are: the page held there is no glide's", () => {
    const stop = startFocusGlide(testContext());
    tapLinkTo04();
    at.y = 6000; // far past 04: a scrollbar drag, which sends no wheel, touch or key
    window.dispatchEvent(new Event("scroll"));
    relayout(-240, "resize");
    frames(7);
    expect(reveal).not.toHaveBeenCalled();
    expect(anchoring()).toBe("");
    stop();
  });

  // WebKit's scroll anchoring moves the page back 40 px as the click lands (the address changing), before the glide has
  // begun: the browser's, not the reader's. The span rule ("between where it began and its target") dropped the glide for
  // it, 7 runs in 1,920; a link's glide is told from a hand by how the page moves instead.
  it("is taken up though the browser moved the page back a little before the glide began", () => {
    const stop = startFocusGlide(testContext());
    const section = document.getElementById("reliability")!;
    section.style.scrollMarginTop = "80px";
    section.getBoundingClientRect = () => ({ top: at.box.top - at.y, bottom: at.box.bottom - at.y }) as DOMRect;
    section.scrollIntoView = reveal;
    vi.spyOn(document.documentElement, "scrollHeight", "get").mockReturnValue(20_000);
    const link = document.createElement("a");
    link.href = "#reliability";
    document.body.prepend(link);
    window.location.hash = "#reliability";
    at.y = 100;
    link.click();
    at.y = 60; // back, by the browser's own adjustment
    window.dispatchEvent(new Event("scroll"));
    frames(1);
    relayout(-240, "resize");
    gliding(3);
    expect(reveal).toHaveBeenCalledTimes(1);
    stop();
  });

  it("is the reader's once a scrollbar's drag holds the page still short of its end: a resize then takes nothing up", () => {
    const stop = startFocusGlide(testContext());
    tapLinkTo04();
    at.y = 400; // the bar, dragged on toward 04 and held there
    window.dispatchEvent(new Event("scroll"));
    frames(6);
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
    for (let k = 0; k < 5; k += 1) {
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
    frames(8);
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

  // The router's own link (the masthead's to the terminal): its click arrives with its default prevented, and the router
  // changes the address and glides once its navigation has gone through, which on a slow machine is more than the thirty
  // frames a glide is given to begin (5 runs in 2,195 at 4x CPU: the watch had let go, and the glide that came after was
  // left 3,700 to 5,500 px short at the resize). Its thirty frames run from the address naming its target.
  describe("by a link the router handles", () => {
    /** The router's link to 04, clicked: its default prevented, the address not yet naming 04. */
    const clickRouterLink = () => {
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
    };

    it("is taken up though the address names its target only after more than thirty frames, the glide after that", () => {
      const stop = startFocusGlide(testContext());
      clickRouterLink();
      frames(45); // the router's navigation, on a slow machine
      expect(anchoring()).toBe(""); // nothing held off while nothing shows the click went anywhere
      window.location.hash = "#reliability";
      frames(3);
      expect(anchoring()).toBe("none");
      gliding(3);
      relayout(-240, "resize");
      gliding(3);
      expect(reveal).toHaveBeenCalledTimes(1);
      expect(reveal).toHaveBeenCalledWith({ block: "start" });
      stop();
    });

    it("gives the glide its thirty frames to begin from the address naming its target, and no more", () => {
      const stop = startFocusGlide(testContext());
      clickRouterLink();
      frames(45);
      window.location.hash = "#reliability";
      frames(20);
      expect(anchoring()).toBe("none");
      frames(15);
      expect(anchoring()).toBe(""); // thirty frames on, no glide: let go
      stop();
    });

    it("arms nothing when the address never names its target: scroll anchoring is never touched, and two seconds on it lets go", () => {
      const stop = startFocusGlide(testContext());
      const set = vi.spyOn(document.documentElement.style, "setProperty");
      const t0 = performance.now();
      const now = vi.spyOn(performance, "now").mockReturnValue(t0);
      clickRouterLink();
      frames(60);
      jump();
      relayout(-240, "resize");
      frames(5);
      expect(reveal).not.toHaveBeenCalled();
      now.mockReturnValue(t0 + 2100); // past the wait
      frames(2);
      window.location.hash = "#reliability"; // too late: nothing is watching
      gliding(3);
      jump();
      gliding(4);
      expect(reveal).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalledWith("overflow-anchor", "none");
      stop();
    });

    it("is the reader's during the wait: a finger on the page lets go before the address ever names its target", () => {
      const stop = startFocusGlide(testContext());
      const set = vi.spyOn(document.documentElement.style, "setProperty");
      clickRouterLink();
      frames(5);
      window.dispatchEvent(new Event("touchmove"));
      window.location.hash = "#reliability";
      gliding(3);
      jump();
      gliding(4);
      expect(reveal).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalledWith("overflow-anchor", "none");
      stop();
    });

    it("counts a page already moving toward the target as begun, the address named or not yet", () => {
      const stop = startFocusGlide(testContext());
      clickRouterLink();
      frames(2);
      gliding(2); // the router's glide, a frame before the address shows
      expect(anchoring()).toBe("none");
      window.location.hash = "#reliability";
      relayout(-240, "resize");
      gliding(3);
      expect(reveal).toHaveBeenCalledTimes(1);
      stop();
    });
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

  it("gives scroll anchoring back when the journey ends mid-glide", () => {
    const stop = startFocusGlide(testContext());
    tapLinkTo04();
    expect(anchoring()).toBe("none");
    stop();
    frames(1);
    expect(anchoring()).toBe("");
  });
});
