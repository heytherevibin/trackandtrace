import { afterEach, describe, expect, it, vi } from "vitest";
import { MOTION_BEFORE_EVENT, MOTION_EVENT } from "@/components/motion/use-motion";
import { startPlaceGuard } from "@/components/landing/journey/chapters";
import { JUMP_EVENT, LAYOUT_EVENT } from "@/components/landing/journey/journey-events";

// 02's place guard (chapters.ts) keeps a reader inside or past #how in place when #how changes size. The drawing
// above it (J5) moves the reader with its own height changes (drawing.ts's keepPlace), by an instant scroll, and then
// tells tt:layout: the guard's picture of the reader must move with it, or a resize that follows before any scroll
// event lands is judged from a place the reader has already left.

const RealResizeObserver = window.ResizeObserver;

afterEach(() => {
  window.ResizeObserver = RealResizeObserver;
  delete document.documentElement.dataset.motion;
  delete document.documentElement.dataset.journey;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("02's place guard", () => {
  it("reads the reader's scroll afresh with #how's box on tt:layout, so a move the layout change made is never stale", () => {
    let observed: ResizeObserverCallback = () => undefined;
    // the page's one observer of #how, captured so the test can deliver its resize
    window.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        observed = callback;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
    document.body.innerHTML = `<header></header><section id="how"></section>`;
    document.querySelector("header")!.getBoundingClientRect = () => ({ height: 64, bottom: 64 }) as DOMRect;
    const how = document.getElementById("how")!;
    how.style.scrollMarginTop = "80px";
    const doc = { top: 1000, height: 3000 };
    let y = 0;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => y);
    how.getBoundingClientRect = () => ({ top: doc.top - y, bottom: doc.top - y + doc.height, width: 800, height: doc.height }) as DOMRect;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const stop = startPlaceGuard();
    y = 1060; // just inside 02
    window.dispatchEvent(new Event("scroll"));
    // the drawing above settles on the still, 254px taller, and its keepPlace moves the reader with it; then that move's
    // own "scroll" event lands, which the guard learns the scroll from, never the box
    doc.top += 254;
    y += 254;
    window.dispatchEvent(new Event(LAYOUT_EVENT));
    window.dispatchEvent(new Event("scroll"));
    // a phone turned: 02 refits, and a resize keeps its reader the same fraction through it: 124 px of its 2,296 px
    // range (a window 768 tall), from where its timeline starts, 1,254 less the masthead's 64. Judged from the box before
    // the drawing's move and the scroll after it, they were 378 px in, and would land at 1,502.
    doc.height = 2600;
    observed([], {} as ResizeObserver);
    expect(scrollTo).toHaveBeenCalledWith({ top: Math.round(1190 + (124 / 2296) * 1896), behavior: "instant" });
    stop();
  });

  it("keeps a reader in 02's last lines on what follows it: its foot within the window's top half is past it (J6-4)", () => {
    let observed: ResizeObserverCallback = () => undefined;
    window.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        observed = callback;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
    document.body.innerHTML = `<header></header><section id="how"></section>`;
    const how = document.getElementById("how")!;
    how.style.scrollMarginTop = "80px";
    const doc = { top: 1000, height: 3000 };
    let y = 0;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => y);
    how.getBoundingClientRect = () => ({ top: doc.top - y, bottom: doc.top - y + doc.height, width: 800, height: doc.height }) as DOMRect;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const stop = startPlaceGuard();
    y = 3880; // 02's foot 120px down the window, #record's heading below it
    window.dispatchEvent(new Event("scroll"));
    doc.height = 2600; // Motion off collapses 02, or the window turns
    observed([], {} as ResizeObserver);
    // by exactly the change, so #record stays where the reader was reading it
    expect(scrollTo).toHaveBeenCalledWith({ top: 3880 - 400, behavior: "instant" });
    stop();
  });

  it("judges the reader against the window they saw, never the one a resize just made (J6-4)", () => {
    let observed: ResizeObserverCallback = () => undefined;
    window.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        observed = callback;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
    document.body.innerHTML = `<header></header><section id="how"></section>`;
    const how = document.getElementById("how")!;
    how.style.scrollMarginTop = "80px";
    const doc = { top: 1000, height: 414 };
    let y = 0;
    let vh = 320;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => y);
    vi.spyOn(window, "innerHeight", "get").mockImplementation(() => vh);
    how.getBoundingClientRect = () => ({ top: doc.top - y, bottom: doc.top - y + doc.height, width: 800, height: doc.height }) as DOMRect;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const stop = startPlaceGuard();
    y = 1060; // 60px into a plain 02 on a window 320px tall: most of that window is 02, so they are inside it
    window.dispatchEvent(new Event("scroll"));
    vh = 1000; // the window turns tall: judged by it, 02's foot (354px down) would sit within its top half
    // and 02 pins: a change of shape, which lands a reader inside it on its start
    document.documentElement.dataset.motion = "on";
    document.documentElement.dataset.journey = "on";
    how.classList.add("is-pinned");
    doc.height = 3300;
    observed([], {} as ResizeObserver);
    expect(scrollTo).toHaveBeenCalledWith({ top: 1000 - 80, behavior: "instant" }); // 02's start, as they were inside it
    stop();
  });

  it("settles Motion's collapse of 02 as Motion changes, before the rebuild's teardowns, so a move they make below 02 stands (J6-7)", () => {
    let observed: ResizeObserverCallback = () => undefined;
    window.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        observed = callback;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
    document.body.innerHTML = `<header></header><section id="how"></section>`;
    const how = document.getElementById("how")!;
    how.style.scrollMarginTop = "80px";
    const doc = { top: 1000, height: 3000 };
    let y = 0;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => y);
    how.getBoundingClientRect = () => ({ top: doc.top - y, bottom: doc.top - y + doc.height, width: 800, height: doc.height }) as DOMRect;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(((opts: ScrollToOptions) => {
      y = opts.top ?? y;
    }) as typeof window.scrollTo);
    const stop = startPlaceGuard();
    y = 9000; // far past 02: reading 08, below the pinned run
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event(MOTION_BEFORE_EVENT));
    doc.height = 2600; // the rewrite of <html data-motion> collapses 02 by the CSS selector alone
    window.dispatchEvent(new Event(MOTION_EVENT));
    expect(y).toBe(9000 - 400); // settled at once, before the rebuild's listeners run
    y -= 2565; // the rebuild tears the run down: its keepPlace moves the reader by its own collapse, below 02
    observed([], {} as ResizeObserver); // 02's observer, a frame later
    expect(y).toBe(9000 - 400 - 2565); // the run's move stands
    expect(scrollTo).toHaveBeenCalledTimes(1);
    stop();
  });

  // Its instant scroll cuts a Tab stop's glide in flight like any other: a resize of #how (the window resized or zoomed)
  // mid-glide stranded focus off-screen unless the move is announced, as every place-keeping jump is (round 3).
  it("announces its move as a place-keeping jump, so a glide it cuts short is taken up again", () => {
    let observed: ResizeObserverCallback = () => undefined;
    window.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        observed = callback;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
    document.body.innerHTML = `<header></header><section id="how"></section>`;
    const how = document.getElementById("how")!;
    const doc = { top: 1000, height: 3000 };
    let y = 0;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => y);
    how.getBoundingClientRect = () => ({ top: doc.top - y, bottom: doc.top - y + doc.height, width: 800, height: doc.height }) as DOMRect;
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const jumps = vi.fn();
    window.addEventListener(JUMP_EVENT, jumps);
    const stop = startPlaceGuard();
    y = 3880; // past 02
    window.dispatchEvent(new Event("scroll"));
    doc.height = 2600; // the window is resized: 02 refits
    observed([], {} as ResizeObserver);
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 3880 - 400, behavior: "instant" });
    expect(jumps).toHaveBeenCalledTimes(1);
    window.removeEventListener(JUMP_EVENT, jumps);
    stop();
  });

  // A resize keeps a reader inside 02 the same fraction through it; a change of its shape (Motion off, or its pin let go
  // in a rebuild once it no longer fits) still lands them on its start (the owner, 2026-09-29).
  describe("a reader inside a pinned 02", () => {
    function pinned02(): { readonly how: HTMLElement; readonly doc: { top: number; height: number }; readonly at: { y: number; vh: number }; readonly resized: () => void } {
      let observed: ResizeObserverCallback = () => undefined;
      window.ResizeObserver = class {
        constructor(callback: ResizeObserverCallback) {
          observed = callback;
        }
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      };
      document.documentElement.dataset.motion = "on";
      document.documentElement.dataset.journey = "on";
      document.body.innerHTML = `<header></header><section id="how" class="chapters is-pinned"></section>`;
      document.querySelector("header")!.getBoundingClientRect = () => ({ height: 64, bottom: 64 }) as DOMRect;
      const how = document.getElementById("how")!;
      how.style.scrollMarginTop = "80px";
      const doc = { top: 1000, height: 2970 }; // 330vh of a window 900 tall
      const at = { y: 0, vh: 900 };
      vi.spyOn(window, "scrollY", "get").mockImplementation(() => at.y);
      vi.spyOn(window, "innerHeight", "get").mockImplementation(() => at.vh);
      how.getBoundingClientRect = () => ({ top: doc.top - at.y, bottom: doc.top - at.y + doc.height, width: 1440, height: doc.height }) as DOMRect;
      vi.spyOn(window, "scrollTo").mockImplementation(((opts: ScrollToOptions) => {
        at.y = opts.top ?? at.y;
      }) as typeof window.scrollTo);
      return { how, doc, at, resized: () => observed([], {} as ResizeObserver) };
    }

    // Its range as its timeline reads it (review, nit): from where the timeline starts (its top under the masthead's
    // 64 px, not its 80 px scroll margin) to its foot at the large viewport's foot.
    it("stays the same fraction through it when the window is resized", () => {
      const { doc, at, resized } = pinned02();
      const stop = startPlaceGuard();
      const y = Math.round(936 + 0.6 * 2134); // 60% of its range: 936 (its timeline's start) to 3070 (its foot at the window's)
      at.y = y;
      window.dispatchEvent(new Event("scroll"));
      at.vh = 700;
      doc.height = 2310; // 330vh of the new window: its range 936 to 2610
      resized();
      expect(at.y).toBe(Math.round(936 + ((y - 936) / 2134) * 1674));
      stop();
    });

    // A phone with its toolbar shown: innerHeight is the large viewport less the toolbar, but every scroll timeline ends
    // at the large viewport's foot (anime's 100lvh), so the fraction is measured to it (review, M1).
    it("measures its range to the large viewport, as its timeline does, a toolbar shown", () => {
      const { doc, at, resized } = pinned02();
      const lvh = { now: 900 };
      at.vh = 800; // the toolbar takes 100 px
      const offset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
        return this.style.height === "100lvh" ? lvh.now : (offset.get?.call(this) as number);
      });
      const stop = startPlaceGuard();
      const y = Math.round(936 + 0.6 * 2134);
      at.y = y;
      window.dispatchEvent(new Event("scroll"));
      lvh.now = 700;
      at.vh = 600;
      window.dispatchEvent(new Event("resize"));
      doc.height = 2310;
      resized();
      expect(at.y).toBe(Math.round(936 + ((y - 936) / 2134) * 1674));
      stop();
    });

    // WebKit lays a resize out in two steps, a frame or more apart and in either order: 100vh (02's 330vh) in one, 100lvh
    // (where its timeline ends) and 100svh in the other, innerHeight the new window's throughout (keep-place.ts, laidOut).
    function twoSteps(): { vh: number; lvh: number } {
      const units = { vh: 900, lvh: 900 };
      const offset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
        if (this.style.height === "100vh") return units.vh;
        if (this.style.height === "100lvh") return units.lvh;
        return offset.get?.call(this) as number;
      });
      return units;
    }

    it("learns no window between the steps: the new one with #how's box still the old one's (review, M3)", () => {
      const { doc, at, resized } = pinned02();
      const units = twoSteps();
      const stop = startPlaceGuard();
      const y = Math.round(936 + 0.6 * 2134);
      at.y = y;
      window.dispatchEvent(new Event("scroll"));
      units.lvh = 700; // the first step: the large viewport, and innerHeight
      at.vh = 700;
      window.dispatchEvent(new Event(LAYOUT_EVENT)); // a piece below told the page it changed (the run, its 100svh pin)
      window.dispatchEvent(new Event("scroll"));
      units.vh = 700; // the second: 02's 330vh
      doc.height = 2310;
      resized();
      expect(at.y).toBe(Math.round(936 + ((y - 936) / 2134) * 1674));
      stop();
    });

    it("settles once the page is laid out for one window, from the step that completes it (open concern 3)", () => {
      const { doc, at, resized } = pinned02();
      const units = twoSteps();
      const stop = startPlaceGuard();
      const y = Math.round(936 + 0.6 * 2134);
      at.y = y;
      window.dispatchEvent(new Event("scroll"));
      units.vh = 700; // the first step: 02's 330vh, and innerHeight
      at.vh = 700;
      doc.height = 2310;
      resized();
      expect(window.scrollTo).not.toHaveBeenCalled(); // the large viewport, and the still's columns above, still the old window's
      window.dispatchEvent(new Event("scroll"));
      units.lvh = 700; // the second: what moved above #how moves it now
      doc.top -= 40;
      resized(); // heard through the page's measures of the window
      expect(at.y).toBe(Math.round(896 + ((y - 936) / 2134) * 1674));
      stop();
    });

    // A piece below that moves the reader tells tt:layout after its move (the run's contract): between the steps too, the
    // guard learns where it left them, or its own move, at the second step, undoes it.
    it("learns a move a piece below made between the steps, and moves the reader past 02 on from it", () => {
      const { doc, at, resized } = pinned02();
      const units = twoSteps();
      const stop = startPlaceGuard();
      at.y = 1000 + 2970 - 120; // 02's foot 120 px down the window: past it
      window.dispatchEvent(new Event("scroll"));
      units.lvh = 700; // the first step
      at.vh = 700;
      at.y -= 300; // a piece below moved the reader by its own change
      window.dispatchEvent(new Event(LAYOUT_EVENT));
      units.vh = 700; // the second: 02's 330vh
      doc.height = 2310;
      resized();
      expect(at.y).toBe(1000 + 2970 - 120 - 300 - 660);
      stop();
    });

    it("lands on its start when Motion goes off: a change of shape", () => {
      const { doc, at } = pinned02();
      const stop = startPlaceGuard();
      at.y = 920 + 0.6 * 2150;
      window.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event(MOTION_BEFORE_EVENT));
      document.documentElement.dataset.motion = "off";
      doc.height = 1400; // the plain section
      window.dispatchEvent(new Event(MOTION_EVENT));
      expect(at.y).toBe(920);
      stop();
    });

    it("lands on its start when its pin is let go (a rebuild once it no longer fits): a change of shape", () => {
      const { how, doc, at, resized } = pinned02();
      const stop = startPlaceGuard();
      at.y = 920 + 0.6 * 2150;
      window.dispatchEvent(new Event("scroll"));
      how.classList.remove("is-pinned");
      doc.height = 1400;
      resized();
      expect(at.y).toBe(920);
      stop();
    });
  });
});
