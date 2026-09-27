import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOAD_LIMIT_MS, drawingModule, liveFits, sceneLoader, type Begin, type LoadLive } from "@/components/landing/journey/drawing";
import { testContext } from "./journey-context";

// drawing.ts's J6 additions, apart from drawing.test.tsx (at its line limit): fit judged before the scene is fetched
// (J6-5), a scene that arrives too late (J5 final review, minor 2), and a resize judged by the window the reader saw.

const html = document.documentElement;

beforeEach(() => {
  html.dataset.drawing = "live";
  html.dataset.saver = "off";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete html.dataset.drawing;
  delete html.dataset.drawingWhy;
  delete html.dataset.saver;
  window.sessionStorage.clear();
  document.body.innerHTML = "";
});

describe("fit, judged before the scene is fetched (J6-5)", () => {
  const markup = `<header></header><section id="anatomy"><div class="anatomy-pin"><div class="anatomy-copy"></div><ol class="callouts"><li class="callout" data-side="left"></li></ol><p class="anatomy-caption"></p><div class="title-block"></div><ol class="anatomy-legend"></ol></div></section>`;

  it("lays the pinned chapter out for an instant, and puts it all back in the same task", () => {
    // live-labels.ts asks whether the window is narrow; jsdom has no matchMedia
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
    document.body.innerHTML = markup;
    const section = document.getElementById("anatomy")!;
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    // jsdom lays nothing out: the zone is empty, so the words do not fit
    expect(liveFits(section)).toBe(false);
    expect(section.classList.contains("is-live")).toBe(false);
    expect(section.querySelector(".live-lines")).toBeNull();
    expect(section.querySelector<HTMLElement>(".anatomy-pin")?.dataset.live).toBeUndefined();
    expect(scrollTo).not.toHaveBeenCalled(); // the reader never moved, so nothing was put back
  });

  it("has nothing to judge without the chapter's markup: the scene's own check decides", () => {
    expect(liveFits(null)).toBe(true);
    document.body.innerHTML = `<section id="anatomy"></section>`;
    expect(liveFits(document.getElementById("anatomy"))).toBe(true);
  });

  it("settles on the still for fit, and never asks for the scene, when the chapter cannot fit", () => {
    const load = vi.fn<LoadLive>();
    const stop = drawingModule(load, () => true, () => false)(testContext());
    expect(html.dataset.drawing).toBe("still");
    expect(html.dataset.drawingWhy).toBe("fit");
    expect(load).not.toHaveBeenCalled();
    stop();
  });

  it("asks for the scene when it fits", () => {
    const load = vi.fn<LoadLive>(() => new Promise<Begin>(() => undefined));
    const stop = drawingModule(load, () => true, () => true)(testContext());
    expect(load).toHaveBeenCalledTimes(1);
    stop();
  });
});

describe("a scene that arrives too late builds nothing (J5 final review, minor 2)", () => {
  it("prepares nothing from a chunk that arrives after the 20 s limit", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const prepareLive = vi.fn<LoadLive>();
    const arrive: { now: () => void } = { now: () => undefined };
    const chunk = new Promise<{ readonly prepareLive: LoadLive }>((resolve) => {
      arrive.now = () => resolve({ prepareLive });
    });
    const stop = drawingModule(sceneLoader(() => chunk), () => true, () => true)(testContext());
    await vi.advanceTimersByTimeAsync(LOAD_LIMIT_MS);
    expect(html.dataset.drawingWhy).toBe("load");
    arrive.now();
    await vi.advanceTimersByTimeAsync(0);
    expect(prepareLive).not.toHaveBeenCalled();
    stop();
    warn.mockRestore();
  });

  it("prepares nothing from a chunk that arrives after its module has ended", async () => {
    const prepareLive = vi.fn<LoadLive>();
    const arrive: { now: () => void } = { now: () => undefined };
    const chunk = new Promise<{ readonly prepareLive: LoadLive }>((resolve) => {
      arrive.now = () => resolve({ prepareLive });
    });
    const stop = drawingModule(sceneLoader(() => chunk), () => true, () => true)(testContext());
    stop(); // a Motion toggle, or leaving "/"
    arrive.now();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(prepareLive).not.toHaveBeenCalled();
  });
});

describe("a resize under the pinned chapter is judged by the window the reader saw (Task 3 review, carried)", () => {
  it("puts a reader over half a short window into the chapter at its start, though the tall window it turned into shows its foot in the top half", async () => {
    const vh = { now: 400 };
    vi.spyOn(window, "innerHeight", "get").mockImplementation(() => vh.now);
    document.body.innerHTML = `<header></header><section id="anatomy"></section>`;
    const section = document.getElementById("anatomy")!;
    const box = { top: 200, height: 2080 }; // 520vh of 400
    section.getBoundingClientRect = () => ({ top: box.top, bottom: box.top + box.height, height: box.height }) as DOMRect;
    const stop = drawingModule(() => Promise.resolve(() => () => undefined), () => true, () => true)(testContext());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(section.classList.contains("is-live")).toBe(true);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    box.top = -1780; // its foot 300px down a 400px window: over half the window still in it, so inside
    window.dispatchEvent(new Event("scroll"));
    vh.now = 1000; // the window turns tall: 300px is now in its top half, which would read as past it
    box.height = 5200;
    window.dispatchEvent(new Event("resize"));
    // inside: the chapter's start, under the masthead (0 here); judged by the new window, it was scrollY + 3120
    expect(scrollTo).toHaveBeenCalledWith({ top: -1780 + window.scrollY, behavior: "instant" });
    stop();
  });
});
