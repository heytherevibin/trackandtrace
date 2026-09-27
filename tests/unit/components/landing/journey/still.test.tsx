import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAWING_EVENT, LAYOUT_EVENT, emit, type DrawingDetail } from "@/components/landing/journey/journey-events";
import { startStill } from "@/components/landing/journey/still";
import { testContext } from "./journey-context";

const html = document.documentElement;

beforeEach(() => {
  document.body.innerHTML = `<section id="anatomy"><div class="anatomy-pin is-columns"><div class="anatomy-copy"></div><div class="anatomy-still"></div><svg class="callout-lines"></svg><ol class="callouts"><li class="callout" data-part="shell" data-side="right" style="top: 40px"></li></ol><div class="title-block"></div></div></section>`;
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }));
  Object.defineProperty(document, "fonts", { configurable: true, value: { ready: Promise.resolve() } });
  html.dataset.drawing = "still";
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "fonts");
  delete html.dataset.drawing;
  document.body.replaceChildren();
});

describe("the still's labels when the drawing goes live (J5-5)", () => {
  it("stand aside at once: columns cleared, nobody scrolled, and the kept place forgotten", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const ctx = testContext();
    ctx.still.set({ columns: true, height: 700 });
    const stop = startStill(ctx);
    html.dataset.drawing = "live";
    emit<DrawingDetail>(DRAWING_EVENT, { mode: "live", reasons: [] });
    expect(document.querySelector(".anatomy-pin")?.classList.contains("is-columns")).toBe(false);
    expect(document.querySelector<HTMLElement>(".callout")?.style.top).toBe("");
    expect(ctx.still.get()).toEqual({ columns: false, height: null });
    expect(scrollTo).not.toHaveBeenCalled();
    stop();
  });

  it("never lights or dims a label while the drawing is live: .is-hot is the live drawing's then", () => {
    const stop = startStill(testContext());
    html.dataset.drawing = "live";
    const label = document.querySelector(".callout")!;
    label.dispatchEvent(new PointerEvent("pointerenter"));
    expect(label.classList.contains("is-hot")).toBe(false);
    label.classList.add("is-hot"); // lit by the live drawing (scene/live.ts)
    label.dispatchEvent(new PointerEvent("pointerleave"));
    expect(label.classList.contains("is-hot")).toBe(true);
    stop();
  });

  it("hands the labels over clean once, at the switch, and never dims one the live drawing lit afterwards", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const stop = startStill(testContext());
    const label = document.querySelector(".callout")!;
    label.dispatchEvent(new PointerEvent("pointerenter"));
    expect(label.classList.contains("is-hot")).toBe(true); // lit by the still
    html.dataset.drawing = "live";
    emit<DrawingDetail>(DRAWING_EVENT, { mode: "live", reasons: [] });
    expect(label.classList.contains("is-hot")).toBe(false); // handed over clean
    label.classList.add("is-hot"); // lit by the live drawing (scene/live.ts)
    emit<DrawingDetail>(DRAWING_EVENT, { mode: "live", reasons: [] });
    emit(LAYOUT_EVENT);
    vi.advanceTimersToNextFrame();
    expect(label.classList.contains("is-hot")).toBe(true);
    stop();
  });
});

describe("the still's columns keep a reader past them in place (J5, J6-4)", () => {
  // The pin's columns take their height from the window, so a resize changes it before still.ts gets a turn: the
  // change to answer is the one on record, unless someone already answered it by moving the reader (02's guard, whose
  // move covers everything above #how's foot; scroll anchoring; a clamp). Answering it again moved them twice.
  const resized = (ctx: ReturnType<typeof testContext>) => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    ctx.still.set({ columns: true, height: 840 }); // the columns at 900px tall, as the reader last saw them
    const pin = document.querySelector<HTMLElement>(".anatomy-pin")!;
    pin.getBoundingClientRect = () => ({ top: -3341, bottom: -2701, height: 640, width: 1440, left: 0, right: 1440 }) as DOMRect; // at 700px
  };

  it("moves a reader past them by a resize's change that nobody has answered", () => {
    const ctx = testContext();
    resized(ctx);
    vi.spyOn(window, "scrollY", "get").mockReturnValue(5355);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const stop = startStill(ctx);
    vi.advanceTimersToNextFrame();
    expect(scrollTo).toHaveBeenCalledWith({ top: 5355 - 200, behavior: "instant" });
    stop();
  });

  it("never answers a resize again once the reader was moved for it (02's guard, anchoring)", () => {
    const ctx = testContext();
    resized(ctx);
    let y = 5355;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => y);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const stop = startStill(ctx);
    y = 4499; // 02's guard moved them by #how's foot, the pin's change included
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    expect(scrollTo).not.toHaveBeenCalled();
    stop();
  });

  it("learns the reader's own scroll while the pin is the height on record, and answers a resize that follows", () => {
    const ctx = testContext();
    resized(ctx);
    const pin = document.querySelector<HTMLElement>(".anatomy-pin")!;
    let height = 840; // still the columns the reader last saw
    pin.getBoundingClientRect = () => ({ top: -3341, bottom: -3341 + height, height, width: 1440, left: 0, right: 1440 }) as DOMRect;
    let y = 5355;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => y);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const stop = startStill(ctx);
    y = 5400; // the reader scrolls by hand, a little further below the pin
    window.dispatchEvent(new Event("scroll"));
    height = 640; // then the window gets shorter, and nobody answers it (scroll anchoring off)
    vi.advanceTimersToNextFrame();
    expect(scrollTo).toHaveBeenCalledWith({ top: 5400 - 200, behavior: "instant" });
    stop();
  });
});
