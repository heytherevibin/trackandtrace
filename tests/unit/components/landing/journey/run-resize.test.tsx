import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAYOUT_EVENT } from "@/components/landing/journey/journey-events";
import { startRun } from "@/components/landing/journey/run";
import { testContext } from "./journey-context";

// run.ts's answer to a resize, on a laid-out stand-in (jsdom lays nothing out; run.test.tsx's, with a run whose height
// is the --run-h it writes): three stations 300px wide and 500px apart on a 1440×836 pin. Anime's scroll sync is the
// e2e's to prove (run.spec.ts); here it is a stand-in that never moves.
vi.mock("animejs", () => ({
  onScroll: () => ({ target: null, progress: 0, container: { handleScroll: () => undefined }, refresh: () => undefined, revert: () => undefined }),
  animate: () => ({ revert: () => undefined }),
}));

const MARKUP = `<header></header><div id="run" class="run"><div class="run-pin"><div class="run-window" aria-hidden="true"><svg class="run-far"></svg><svg class="run-line"></svg><svg class="run-near"></svg></div><span class="run-train" aria-hidden="true"><span></span></span><div class="run-track"><section id="features"><div class="run-intro" data-station=""></div><article data-station=""></article></section><section id="use"><div data-station=""></div></section></div></div></div>`;

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

// A resize keeps a reader inside the running run the same fraction through it, so on the same station (the owner,
// 2026-09-29). By the time its pin's observer hears of it, the page has already laid the new window out and the pieces
// above have moved the reader (02's guard, the live drawing's pin): they are kept from where they last read it.
describe("a resize, with the reader inside it", () => {
  let RealResizeObserver: typeof ResizeObserver;
  beforeEach(() => {
    RealResizeObserver = window.ResizeObserver;
  });
  afterEach(() => {
    window.ResizeObserver = RealResizeObserver;
  });

  function resizable() {
    document.body.innerHTML = MARKUP;
    const at = { y: 0, vh: 836, top: 2000, w: 1440, h: 836, gap: 500, width: 300 };
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => at.y);
    vi.spyOn(window, "innerHeight", "get").mockImplementation(() => at.vh);
    vi.mocked(window.scrollTo).mockImplementation(((opts: ScrollToOptions) => {
      at.y = opts.top ?? at.y;
    }) as typeof window.scrollTo);
    const run = document.getElementById("run")!;
    const height = () => (run.classList.contains("is-running") ? Number.parseFloat(run.style.getPropertyValue("--run-h")) : 900);
    run.getBoundingClientRect = () => ({ top: at.top - at.y, bottom: at.top - at.y + height(), left: 0, right: at.w, width: at.w, height: height() }) as DOMRect;
    const pin = run.querySelector<HTMLElement>(".run-pin")!;
    Object.defineProperty(pin, "clientHeight", { configurable: true, get: () => at.h });
    Object.defineProperty(pin, "clientWidth", { configurable: true, get: () => at.w });
    run.querySelector<HTMLElement>(".run-track")!.getBoundingClientRect = () => ({ left: 0 }) as DOMRect;
    run.querySelectorAll<HTMLElement>("[data-station]").forEach((s, i) => {
      Object.defineProperty(s, "offsetHeight", { configurable: true, value: 300 });
      s.getBoundingClientRect = () => ({ left: i * at.gap, right: i * at.gap + at.width, top: 0, bottom: 300 }) as DOMRect;
    });
    // the pin's own observer, captured to deliver the resize as the browser would, once it has laid the window out
    const observed = new Map<Element, ResizeObserverCallback>();
    window.ResizeObserver = class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element): void {
        observed.set(target, this.callback);
      }
      unobserve(): void {}
      disconnect(): void {}
    };
    const resized = () => observed.get(pin)?.([], {} as ResizeObserver);
    return { run, at, resized };
  }

  it("keeps them the same fraction through it, from the place they last read it in", () => {
    const { run, at, resized } = resizable();
    const stop = startRun(testContext());
    expect(run.style.getPropertyValue("--run-h")).toBe("1836px"); // the travel 1,000: its range, in a window 836 tall
    at.y = 2000 + 600; // 60% through
    window.dispatchEvent(new Event("scroll"));
    at.w = 1200; // the window narrower and shorter: its stations 250 wide and 400 apart, the travel 800
    at.gap = 400;
    at.width = 250;
    at.vh = 700;
    at.h = 700;
    at.top = 1950; // the text above it reflowed
    at.y = 2500; // and a piece above moved the reader by its own change
    window.dispatchEvent(new Event("resize"));
    resized();
    expect(run.style.getPropertyValue("--run-h")).toBe("1500px");
    expect(at.y).toBe(1950 + 0.6 * 800);
    stop();
  });

  it("lands them on its start when the run no longer fits: a change of shape", () => {
    const { run, at, resized } = resizable();
    const stop = startRun(testContext());
    at.y = 2000 + 600;
    window.dispatchEvent(new Event("scroll"));
    at.vh = 400;
    at.h = 400; // 400 - 96 - 20 leaves 284px for 300px stations
    at.top = 1950;
    resized();
    expect(run.classList.contains("is-running")).toBe(false);
    expect(at.y).toBe(1950);
    stop();
  });

  it("never re-measures the running run for a resize before its pin's observer has judged it", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const { run, at } = resizable();
    const stop = startRun(testContext());
    at.y = 2000 + 600;
    window.dispatchEvent(new Event("scroll"));
    at.vh = 700;
    at.h = 700;
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event(LAYOUT_EVENT)); // a piece above told the page it changed, in the same frame
    vi.advanceTimersToNextFrame();
    expect(run.style.getPropertyValue("--run-h")).toBe("1836px"); // left for the observer, which runs after 02's guard
    stop();
  });

  // Its place is kept without a layout read on every scroll (review, nit): the scroll alone, while the window is the size
  // it last measured the run in; the run's box on a layout change, a resize, or a change of the page's height.
  it("learns the reader's scroll without reading the layout on each scroll", () => {
    const { run, at, resized } = resizable();
    const stop = startRun(testContext());
    const rect = vi.spyOn(run, "getBoundingClientRect");
    for (const y of [2100, 2300, 2600]) {
      at.y = y;
      window.dispatchEvent(new Event("scroll"));
    }
    expect(rect).not.toHaveBeenCalled();
    at.vh = 700; // and still judged from the last of them: 60% through
    at.h = 700;
    resized();
    expect(at.y).toBe(2000 + 0.6 * 1000);
    stop();
  });

  // WebKit lays a resize out in two steps, a frame or more apart and in either order: 100vh (02's 330vh, above the run) in
  // one, 100svh (the run's pin) and 100lvh in the other, innerHeight the new window's throughout (keep-place.ts, laidOut).
  function twoSteps(): { vh: number; lvh: number } {
    const units = { vh: 836, lvh: 836 };
    const offset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight")!;
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      if (this.style.height === "100vh") return units.vh;
      if (this.style.height === "100lvh") return units.lvh;
      return offset.get?.call(this) as number;
    });
    return units;
  }

  // Answered at its pin's step, on a page 02 had yet to refit, the run's move was undone by 02's guard answering the next.
  it("answers the step that completes the resize, from the place before both, its pin's step first", () => {
    const { run, at, resized } = resizable();
    const units = twoSteps();
    const stop = startRun(testContext());
    at.y = 2000 + 600; // 60% through
    window.dispatchEvent(new Event("scroll"));
    at.h = 700; // the first step: the pin (100svh), the large viewport and innerHeight
    at.vh = 700;
    units.lvh = 700;
    resized();
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(run.style.getPropertyValue("--run-h")).toBe("1836px");
    units.vh = 700; // the second: 02 above refits, and its guard moves the reader by its change
    at.top = 1950;
    at.y = 2550;
    resized(); // heard through the page's measures of the window
    expect(run.style.getPropertyValue("--run-h")).toBe("1700px");
    expect(at.y).toBe(1950 + 0.6 * 1000);
    stop();
  });

  // 02 above refit in the first step, and its guard waits for the second to move the reader: learned between them, the
  // run's box had moved and the reader not yet, and the run then kept the wrong fraction.
  it("learns no place between the steps, 02's step first", () => {
    const { at, resized } = resizable();
    const units = twoSteps();
    const stop = startRun(testContext());
    at.y = 2000 + 600; // 60% through
    window.dispatchEvent(new Event("scroll"));
    units.vh = 700; // the first step: 02's 330vh above, and innerHeight
    at.vh = 700;
    at.top = 1950;
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("scroll"));
    units.lvh = 700; // the second: the pin, and 02's guard moves the reader by 02's change
    at.h = 700;
    at.y = 2550;
    resized();
    expect(at.y).toBe(1950 + 0.6 * 1000);
    stop();
  });

  it("owes a relayout a layout change asks for between the steps until the page is laid out for one window", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const { run, at, resized } = resizable();
    const units = twoSteps();
    const stop = startRun(testContext());
    units.vh = 700; // the first step
    at.vh = 700;
    at.gap = 400; // and something in the run laid out afresh
    window.dispatchEvent(new Event(LAYOUT_EVENT));
    vi.advanceTimersToNextFrame();
    expect(run.style.getPropertyValue("--run-h")).toBe("1836px"); // not measured on a page between two windows
    units.lvh = 700; // the second, the pin as it was (its floor)
    resized();
    vi.advanceTimersToNextFrame();
    expect(run.style.getPropertyValue("--run-h")).toBe("1636px"); // the travel 800
    stop();
  });
});

