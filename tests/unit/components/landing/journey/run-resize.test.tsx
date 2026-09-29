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
});
