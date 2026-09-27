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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
    vi.useRealTimers();
    stop();
  });
});
