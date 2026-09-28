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

// Motion's rebuild tears the still down, its columns cleared, and starts its successor in the same task. Laid out again
// only a frame later, the chapter stood 304px shorter for everything that measured the page meanwhile: the drawing's
// start tells tt:layout, and 02's place guard took that half-built page for the reader's, then kept the reader 304px
// past #record once 02's padding landed in the same frame (the nightly's WebKit, under load).
describe("the still's successor in a rebuild", () => {
  it("lays out again, in the same task, the columns its predecessor cleared, and says so", () => {
    const ctx = testContext();
    ctx.still.set({ columns: true, height: 944 }); // what the reader was looking at
    const pin = document.querySelector<HTMLElement>(".anatomy-pin")!;
    pin.classList.remove("is-columns"); // the predecessor's teardown
    let height = 640;
    const rect = (top: number, bottom: number, left = 0, right = 1440) => ({ top, bottom, height: bottom - top, left, right, width: right - left }) as DOMRect;
    pin.getBoundingClientRect = () => rect(-3000, -3000 + height);
    // the columns' own boxes, as a wide window lays them out: the words at the top, the title block at the foot
    document.querySelector(".anatomy-copy")!.getBoundingClientRect = () => rect(-3000, -2900, 0, 600);
    document.querySelector(".title-block")!.getBoundingClientRect = () => rect(-2200, -2100, 1000, 1440);
    document.querySelector(".callout")!.getBoundingClientRect = () => rect(-2960, -2920, 1180, 1440);
    const observer = vi.spyOn(pin.classList, "add").mockImplementation(function (this: DOMTokenList, ...tokens: string[]) {
      if (tokens.includes("is-columns")) height = 944;
      return DOMTokenList.prototype.add.apply(this, tokens);
    });
    const told = vi.fn();
    window.addEventListener(LAYOUT_EVENT, told);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const stop = startStill(ctx);
    expect(pin.classList.contains("is-columns")).toBe(true);
    expect(told).toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled(); // the reader never saw it collapse: nobody is moved
    window.removeEventListener(LAYOUT_EVENT, told);
    observer.mockRestore();
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

  it("issues no scroll when the reader already stands where the change puts them: an instant scroll cancels a Tab stop's glide", () => {
    const ctx = testContext();
    resized(ctx);
    let y = 5355;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => y);
    const pin = document.querySelector<HTMLElement>(".anatomy-pin")!;
    const rect = pin.getBoundingClientRect();
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const stop = startStill(ctx);
    // scroll anchoring answers the change as the pass lays it out, before the pass reads the pin's new height
    let reads = 0;
    pin.getBoundingClientRect = () => {
      reads += 1;
      if (reads === 2) y = 5355 - 200;
      return rect;
    };
    vi.advanceTimersToNextFrame();
    expect(scrollTo).not.toHaveBeenCalled();
    stop();
  });
});
