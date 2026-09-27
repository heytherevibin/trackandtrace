import { afterEach, describe, expect, it, vi } from "vitest";
import { MOTION_BEFORE_EVENT, MOTION_EVENT } from "@/components/motion/use-motion";
import { startPlaceGuard } from "@/components/landing/journey/chapters";
import { LAYOUT_EVENT } from "@/components/landing/journey/journey-events";

// 02's place guard (chapters.ts) keeps a reader inside or past #how in place when #how changes size. The drawing
// above it (J5) moves the reader with its own height changes (drawing.ts's keepPlace), by an instant scroll, and then
// tells tt:layout: the guard's picture of the reader must move with it, or a resize that follows before any scroll
// event lands is judged from a place the reader has already left.

const RealResizeObserver = window.ResizeObserver;

afterEach(() => {
  window.ResizeObserver = RealResizeObserver;
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
    // the drawing above settles on the still, 254px taller, and its keepPlace moves the reader with it
    doc.top += 254;
    y += 254;
    window.dispatchEvent(new Event(LAYOUT_EVENT));
    // a phone turned before any scroll event lands: 02 refits
    doc.height = 2600;
    observed([], {} as ResizeObserver);
    expect(scrollTo).toHaveBeenCalledWith({ top: 1254 - 80, behavior: "instant" });
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
    doc.height = 3300; // and 02 pins
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
});
