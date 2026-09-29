import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FONT_WAIT_MS, LOAD_LIMIT_MS, drawingModule, liveFits, sceneLoader, type Begin, type LoadLive } from "@/components/landing/journey/drawing";
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
  Reflect.deleteProperty(document, "fonts"); // jsdom has none: a test's stand-in
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

  it("undoes every write the trial made: the pin's data-live, data-compact and --anatomy-copy-h, the labels' transform and clip-path, .live-lines and .is-live", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
    document.body.innerHTML = markup;
    const section = document.getElementById("anatomy")!;
    const pin = section.querySelector<HTMLElement>(".anatomy-pin")!;
    const label = section.querySelector<HTMLElement>(".callout")!;
    const written = new Set<string>();
    const seen = new MutationObserver((records) => {
      for (const r of records) written.add(r.type === "childList" ? "children" : `${(r.target as Element).className || (r.target as Element).id}:${r.attributeName}`);
    });
    seen.observe(section, { attributes: true, childList: true, subtree: true });
    liveFits(section);
    const records = seen.takeRecords();
    seen.disconnect();
    for (const r of records) written.add(r.type === "childList" ? "children" : `${(r.target as Element).className || (r.target as Element).id}:${r.attributeName}`);
    // the trial wrote them (columns tried, compact and not, then the list), so undoing them is proven, not assumed
    expect([...written]).toEqual(expect.arrayContaining(["anatomy:class", "anatomy-pin:data-live", "anatomy-pin:data-compact", "anatomy-pin:style", "children"]));
    expect(section.classList.contains("is-live")).toBe(false);
    expect(pin.dataset.live).toBeUndefined();
    expect(pin.hasAttribute("data-compact")).toBe(false);
    expect(pin.style.getPropertyValue("--anatomy-copy-h")).toBe("");
    expect(label.style.transform).toBe("");
    expect(label.style.clipPath).toBe("");
    expect(section.querySelector(".live-lines")).toBeNull();
  });

  it("puts back a reader the trial moved through jumpTo: announced, and never a sub-pixel no-op that would cancel a glide", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
    document.body.innerHTML = markup;
    const section = document.getElementById("anatomy")!;
    const pin = section.querySelector<HTMLElement>(".anatomy-pin")!;
    const scroll = { y: 3000, during: 3000 };
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => scroll.y);
    // scroll anchoring moving a reader below the chapter while it stands pinned for the trial
    const box = pin.getBoundingClientRect.bind(pin);
    pin.getBoundingClientRect = () => {
      scroll.y = scroll.during;
      return box();
    };
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const jumps = vi.fn();
    window.addEventListener("tt:jump", jumps);
    scroll.during = 3000.4; // under a pixel: nothing to put back
    liveFits(section);
    expect(scrollTo).not.toHaveBeenCalled();
    scroll.y = 3000;
    scroll.during = 3480;
    liveFits(section);
    expect(scrollTo).toHaveBeenCalledWith({ top: 3000, behavior: "instant" });
    expect(jumps).toHaveBeenCalledTimes(1);
    window.removeEventListener("tt:jump", jumps);
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

  // Judged in the fallback font, a first visit's chapter can read as too tall, and holds the still for the whole build
  // (Task 4 review): the first judgement waits for the page's own type.
  it("waits for the web fonts before judging fit, then judges once and asks for the scene", async () => {
    const loaded: { now: () => void } = { now: () => undefined };
    const ready = new Promise<void>((resolve) => {
      loaded.now = resolve;
    });
    const fonts = { status: "loading", ready };
    Object.defineProperty(document, "fonts", { configurable: true, value: fonts });
    const fits = vi.fn(() => true);
    const load = vi.fn<LoadLive>(() => new Promise<Begin>(() => undefined));
    const stop = drawingModule(load, () => true, fits)(testContext());
    expect(fits).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    fonts.status = "loaded";
    loaded.now();
    await ready;
    await Promise.resolve();
    expect(fits).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    stop();
  });

  it("judges fit at once when the web fonts have already loaded", () => {
    Object.defineProperty(document, "fonts", { configurable: true, value: { status: "loaded", ready: Promise.resolve() } });
    const fits = vi.fn(() => false);
    const load = vi.fn<LoadLive>();
    const stop = drawingModule(load, () => true, fits)(testContext());
    expect(fits).toHaveBeenCalledTimes(1);
    expect(html.dataset.drawingWhy).toBe("fit");
    expect(load).not.toHaveBeenCalled();
    stop();
  });

  it("judges nothing once its module has ended before the fonts load", async () => {
    const loaded: { now: () => void } = { now: () => undefined };
    const ready = new Promise<void>((resolve) => {
      loaded.now = resolve;
    });
    Object.defineProperty(document, "fonts", { configurable: true, value: { status: "loading", ready } });
    const fits = vi.fn(() => true);
    const load = vi.fn<LoadLive>();
    const stop = drawingModule(load, () => true, fits)(testContext());
    stop();
    loaded.now();
    await ready;
    await Promise.resolve();
    expect(fits).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
  });

  // A font request that never answers leaves document.fonts loading forever: the wait is capped, then fit is judged in
  // whatever type the page has (a misjudgement only falls back to the still), and the 20 s scene limit counts from
  // when the scene was first wanted, the wait included (re-review, N1; §3.C, J5 pre-flight #14).
  describe("web fonts that never load", () => {
    const stalled = () => Object.defineProperty(document, "fonts", { configurable: true, value: { status: "loading", ready: new Promise<void>(() => undefined) } });

    it("stops waiting after about 3 s, then judges fit and asks for the scene", async () => {
      vi.useFakeTimers();
      stalled();
      const fits = vi.fn(() => true);
      const load = vi.fn<LoadLive>(() => new Promise<Begin>(() => undefined));
      const stop = drawingModule(load, () => true, fits)(testContext());
      expect(FONT_WAIT_MS).toBeLessThanOrEqual(3_000);
      await vi.advanceTimersByTimeAsync(FONT_WAIT_MS - 1);
      expect(fits).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(fits).toHaveBeenCalledTimes(1);
      expect(load).toHaveBeenCalledTimes(1);
      stop();
    });

    it("settles on the still for fit once the wait is over, when the chapter cannot fit", async () => {
      vi.useFakeTimers();
      stalled();
      const load = vi.fn<LoadLive>();
      const stop = drawingModule(load, () => true, () => false)(testContext());
      await vi.advanceTimersByTimeAsync(FONT_WAIT_MS);
      expect(html.dataset.drawing).toBe("still");
      expect(html.dataset.drawingWhy).toBe("fit");
      expect(load).not.toHaveBeenCalled();
      stop();
    });

    it("settles on the still (load) 20 s after the scene was first wanted, the font wait included", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      stalled();
      const stop = drawingModule(sceneLoader(() => new Promise(() => undefined)), () => true, () => true)(testContext());
      await vi.advanceTimersByTimeAsync(LOAD_LIMIT_MS - 1);
      expect(html.dataset.drawingWhy).toBe("");
      await vi.advanceTimersByTimeAsync(1);
      expect(html.dataset.drawing).toBe("still");
      expect(html.dataset.drawingWhy).toBe("load");
      stop();
      warn.mockRestore();
    });

    it("leaves nothing waiting once its module has ended", async () => {
      vi.useFakeTimers();
      stalled();
      const fits = vi.fn(() => true);
      const load = vi.fn<LoadLive>();
      drawingModule(load, () => true, fits)(testContext())();
      await vi.advanceTimersByTimeAsync(FONT_WAIT_MS);
      expect(fits).not.toHaveBeenCalled();
      expect(load).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
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
  it("keeps a reader over half a short window into the chapter the same fraction through it, though the tall window it turned into shows its foot in the top half", async () => {
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
    box.top = -1630; // its foot 450px down a 400px window: the window wholly in it, so inside
    window.dispatchEvent(new Event("scroll"));
    vh.now = 1000; // the window turns tall: 450px is now in its top half, which would read as past it
    box.height = 5200;
    window.dispatchEvent(new Event("resize"));
    // inside, a resize: the same fraction through it (1,630 of its 1,680 px range, then of 4,200; the masthead 0 here);
    // judged by the new window, it was scrollY + 3120, by exactly the change
    expect(scrollTo).toHaveBeenCalledWith({ top: Math.round(-1630 + (1630 / 1680) * 4200) + window.scrollY, behavior: "instant" });
    stop();
  });

  it("issues no scroll for a reader past it whom scroll anchoring already moved: an instant scroll cancels a Tab stop's glide", async () => {
    vi.spyOn(window, "innerHeight", "get").mockImplementation(() => 400);
    const scroll = { y: 0 };
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => scroll.y);
    document.body.innerHTML = `<header></header><section id="anatomy"></section>`;
    const section = document.getElementById("anatomy")!;
    const doc = { top: 200, height: 2080 };
    section.getBoundingClientRect = () => ({ top: doc.top - scroll.y, bottom: doc.top - scroll.y + doc.height, height: doc.height }) as DOMRect;
    const stop = drawingModule(() => Promise.resolve(() => () => undefined), () => true, () => true)(testContext());
    await new Promise((resolve) => setTimeout(resolve, 0));
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    scroll.y = 2100; // its foot 180px down the window: past it
    window.dispatchEvent(new Event("scroll"));
    doc.height = 1800; // a resize shrinks it by 280px, and the browser's anchoring moves the reader with it
    scroll.y = 2100 - 280;
    window.dispatchEvent(new Event("resize"));
    expect(scrollTo).not.toHaveBeenCalled();
    stop();
  });
});
