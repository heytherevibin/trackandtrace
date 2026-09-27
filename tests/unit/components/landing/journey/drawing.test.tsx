import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawingModule, noLiveDrawing, startDrawing, type Ask, type Begin, type LoadLive } from "@/components/landing/journey/drawing";
import { DRAWING_EVENT, LAYOUT_EVENT, WEBGL_EVENT, emit, type DrawingDetail, type WebglDetail } from "@/components/landing/journey/journey-events";
import type { Engine } from "@/components/landing/journey/scene/engine";
import { keep, type JourneyContext } from "@/components/landing/journey/start-journey";
import { testContext } from "./journey-context";

const html = document.documentElement;
const ctx = (motion: boolean): JourneyContext => testContext({ motion });
const heard: DrawingDetail[] = [];
const hear = (e: Event) => heard.push((e as CustomEvent<DrawingDetail>).detail);

beforeEach(() => {
  heard.length = 0;
  window.addEventListener(DRAWING_EVENT, hear);
  html.dataset.drawing = "live";
  html.dataset.saver = "off";
});

afterEach(() => {
  window.removeEventListener(DRAWING_EVENT, hear);
  delete html.dataset.drawing;
  delete html.dataset.drawingWhy;
  delete html.dataset.saver;
  window.sessionStorage.clear();
  document.body.innerHTML = "";
});

describe("the drawing's mode on the page", () => {
  it("draws still at once with Motion off, and says why", () => {
    const stop = startDrawing(ctx(false));
    expect(html.dataset.drawing).toBe("still");
    expect(html.dataset.drawingWhy).toBe("motion");
    expect(heard.at(-1)).toEqual({ mode: "still", reasons: ["motion"] });
    stop();
  });

  it("settles still with the reason load when the live drawing will not come", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const stop = drawingModule(noLiveDrawing, () => true)(ctx(true));
    await vi.waitFor(() => expect(html.dataset.drawingWhy).toBe("load"));
    expect(html.dataset.drawing).toBe("still");
    expect(warn).toHaveBeenCalledTimes(1);
    stop();
  });

  it("never asks for the live drawing on Data Saver, or once the session fell to the floor", () => {
    const load = vi.fn<LoadLive>(() => Promise.reject(new Error("no")));
    html.dataset.saver = "on";
    let stop = drawingModule(load, () => true)(ctx(true));
    expect(html.dataset.drawingWhy).toBe("saver");
    stop();
    html.dataset.saver = "off";
    window.sessionStorage.setItem("tt.q", "still");
    stop = drawingModule(load, () => true)(ctx(true));
    expect(html.dataset.drawingWhy).toBe("quality");
    expect(load).not.toHaveBeenCalled();
    stop();
  });

  it("draws live when the live drawing loads, stops it on teardown, and follows its reasons", async () => {
    const liveStop = vi.fn();
    const begin = vi.fn<Begin>(() => liveStop);
    let ask = null as Ask | null;
    const load = vi.fn<LoadLive>((a) => {
      ask = a;
      return Promise.resolve(begin);
    });
    const stop = drawingModule(load, () => true)(ctx(true));
    await vi.waitFor(() => expect(begin).toHaveBeenCalledTimes(1));
    expect(html.dataset.drawing).toBe("live");
    ask?.still("webgl");
    expect(html.dataset.drawing).toBe("still");
    expect(liveStop).toHaveBeenCalledTimes(1);
    ask?.live("webgl");
    await vi.waitFor(() => expect(begin).toHaveBeenCalledTimes(2));
    expect(load).toHaveBeenCalledTimes(1);
    stop();
    expect(liveStop).toHaveBeenCalledTimes(2);
  });

  it("stops a live drawing that arrives after the journey was torn down", async () => {
    let arrive: (b: Begin) => void = () => {};
    const begin = vi.fn<Begin>(() => () => undefined);
    const stop = drawingModule(() => new Promise<Begin>((resolve) => (arrive = resolve)), () => true)(ctx(true));
    stop();
    arrive(begin);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(begin).not.toHaveBeenCalled();
  });

  it("writes back the drawing the boot script's own rule would choose on teardown, dropping data-drawing-why", async () => {
    // Motion on, no saver, no stored quality floor: the boot script's own rule (resolveDrawing) says "live".
    // The module still settles "still" at runtime, for its own reason ("load", since this loader brings no live
    // drawing) — teardown must write back what a fresh mount's boot script would choose, not leave that runtime
    // reason stuck in the markup for the next mount to find (spec, J4-4 minor #4).
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const stop = drawingModule(noLiveDrawing, () => true)(ctx(true));
    await vi.waitFor(() => expect(html.dataset.drawingWhy).toBe("load"));
    expect(html.dataset.drawing).toBe("still");
    stop();
    expect(html.dataset.drawing).toBe("live");
    expect(html.dataset.drawingWhy).toBeUndefined();
  });

  it("writes back still on teardown when Motion is off, matching the boot script", () => {
    const stop = startDrawing(ctx(false));
    expect(html.dataset.drawing).toBe("still");
    stop();
    expect(html.dataset.drawing).toBe("still");
    expect(html.dataset.drawingWhy).toBeUndefined();
  });
});

describe("J5: prepare, begin, and the reader's place", () => {
  const chapter = (top: number, height = 5000) => {
    document.body.innerHTML = `<header></header><section id="anatomy"></section>`;
    const section = document.getElementById("anatomy")!;
    const box = { top, height };
    section.getBoundingClientRect = () => ({ top: box.top, bottom: box.top + box.height, height: box.height }) as DOMRect;
    return { section, box };
  };
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  afterEach(() => vi.useRealTimers());

  it("never asks for the scene without WebGL", () => {
    const load = vi.fn<LoadLive>();
    const stop = drawingModule(load, () => false)(testContext());
    expect(html.dataset.drawingWhy).toBe("webgl");
    expect(load).not.toHaveBeenCalled();
    stop();
  });

  it("pins the chapter when the live drawing begins, and unpins it on teardown", async () => {
    const { section } = chapter(200);
    const liveStop = vi.fn();
    const stop = drawingModule(() => Promise.resolve(() => liveStop), () => true)(testContext());
    await flush();
    expect(html.dataset.drawing).toBe("live");
    expect(section.classList.contains("is-live")).toBe(true);
    stop();
    expect(liveStop).toHaveBeenCalledTimes(1);
    expect(section.classList.contains("is-live")).toBe(false);
  });

  it("tells tt:layout when it pins the chapter and when it unpins it, so 02's place guard re-measures", async () => {
    const { section } = chapter(200);
    const pinnedAtLayout: boolean[] = [];
    const onLayout = () => pinnedAtLayout.push(section.classList.contains("is-live"));
    window.addEventListener(LAYOUT_EVENT, onLayout);
    let ask = null as Ask | null;
    const stop = drawingModule((a) => {
      ask = a;
      return Promise.resolve(() => () => undefined);
    }, () => true)(testContext());
    await flush();
    expect(pinnedAtLayout.at(-1)).toBe(true);
    ask?.still("webgl");
    expect(pinnedAtLayout.at(-1)).toBe(false);
    ask?.live("webgl");
    await flush();
    expect(pinnedAtLayout.at(-1)).toBe(true);
    const before = pinnedAtLayout.length;
    stop();
    expect(pinnedAtLayout.length).toBe(before + 1);
    expect(pinnedAtLayout.at(-1)).toBe(false);
    window.removeEventListener(LAYOUT_EVENT, onLayout);
  });

  it("holds a reader below the chapter at the still, preparing the scene, and goes live once they come back above it", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const { section, box } = chapter(-600);
    const begin = vi.fn(() => () => undefined);
    const load = vi.fn<LoadLive>(() => Promise.resolve(begin));
    const stop = drawingModule(load, () => true)(testContext());
    expect(html.dataset.drawingWhy).toBe("place");
    expect(load).toHaveBeenCalledTimes(1);
    await flush();
    expect(begin).not.toHaveBeenCalled();
    box.top = 120;
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    await flush();
    expect(html.dataset.drawing).toBe("live");
    expect(begin).toHaveBeenCalledTimes(1);
    expect(section.classList.contains("is-live")).toBe(true);
    stop();
  });

  it("holds a reader who went below the chapter while the scene loaded at the still, and goes live once they come back above it (J5-2)", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const { section, box } = chapter(200);
    let arrive: (b: Begin) => void = () => {};
    const begin = vi.fn<Begin>(() => () => undefined);
    const load = vi.fn<LoadLive>(() => new Promise<Begin>((resolve) => (arrive = resolve)));
    const stop = drawingModule(load, () => true)(testContext());
    expect(load).toHaveBeenCalledTimes(1); // preparing while nothing holds the drawing
    box.top = -600; // the reader scrolls on past the chapter's top before the scene arrives
    window.dispatchEvent(new Event("scroll"));
    arrive(begin);
    await flush();
    expect(html.dataset.drawing).toBe("still");
    expect(html.dataset.drawingWhy).toBe("place");
    expect(begin).not.toHaveBeenCalled();
    expect(section.classList.contains("is-live")).toBe(false);
    box.top = 120;
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    await flush();
    expect(html.dataset.drawing).toBe("live");
    expect(begin).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1); // the scene it already prepared
    expect(section.classList.contains("is-live")).toBe(true);
    stop();
  });

  it("asks the journey's engine after a rebuild: a GPU lost before it settles the new build on the still, until restored (J5-4)", async () => {
    chapter(200);
    const gpu = { gone: false };
    const scene = keep<Promise<Engine> | null>(Promise.resolve({ lost: () => gpu.gone } as unknown as Engine));
    const begin = vi.fn<Begin>(() => () => undefined);
    const load: LoadLive = () => Promise.resolve(begin);
    let stop = drawingModule(load, () => true)(testContext({ scene }));
    await flush();
    expect(begin).toHaveBeenCalledTimes(1);
    gpu.gone = true;
    emit<WebglDetail>(WEBGL_EVENT, "lost");
    expect(html.dataset.drawingWhy).toBe("webgl");
    stop(); // a rebuild (the Motion switch, a fit change) while the GPU is gone
    stop = drawingModule(load, () => true)(testContext({ scene }));
    await flush();
    expect(html.dataset.drawing).toBe("still");
    expect(html.dataset.drawingWhy).toBe("webgl");
    expect(begin).toHaveBeenCalledTimes(1);
    expect(document.getElementById("anatomy")?.classList.contains("is-live")).toBe(false);
    gpu.gone = false;
    emit<WebglDetail>(WEBGL_EVENT, "restored");
    await flush();
    expect(html.dataset.drawing).toBe("live");
    expect(begin).toHaveBeenCalledTimes(2);
    stop();
  });

  it("hears the GPU: lost draws still, restored draws live again from the scene it already has", async () => {
    chapter(200);
    const liveStop = vi.fn();
    const begin = vi.fn(() => liveStop);
    const load = vi.fn<LoadLive>(() => Promise.resolve(begin));
    const stop = drawingModule(load, () => true)(testContext());
    await flush();
    emit<WebglDetail>(WEBGL_EVENT, "lost");
    expect(html.dataset.drawingWhy).toBe("webgl");
    expect(liveStop).toHaveBeenCalledTimes(1);
    emit<WebglDetail>(WEBGL_EVENT, "restored");
    await flush();
    expect(html.dataset.drawing).toBe("live");
    expect(begin).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenCalledTimes(1);
    stop();
  });

  it("hears a GPU lost while the engine is still being built: it settles on the still, and begins only once restored", async () => {
    // The engine tells a loss during its build synchronously at the end of createEngine, before its promise resolves
    // to the loader (Task 4): the listener must already be there.
    const { section } = chapter(200);
    const begin = vi.fn(() => () => undefined);
    const load = vi.fn<LoadLive>(async () => {
      await Promise.resolve();
      emit<WebglDetail>(WEBGL_EVENT, "lost");
      return begin;
    });
    const stop = drawingModule(load, () => true)(testContext());
    await flush();
    expect(html.dataset.drawing).toBe("still");
    expect(html.dataset.drawingWhy).toBe("webgl");
    expect(begin).not.toHaveBeenCalled();
    expect(section.classList.contains("is-live")).toBe(false);
    emit<WebglDetail>(WEBGL_EVENT, "restored");
    await flush();
    expect(html.dataset.drawing).toBe("live");
    expect(begin).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledTimes(1);
    stop();
  });

  it("warns once and draws still when the scene will not load, or will not start", async () => {
    chapter(200);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    let stop = drawingModule(() => Promise.reject(new Error("blocked")), () => true)(testContext());
    await flush();
    expect(html.dataset.drawingWhy).toBe("load");
    stop();
    stop = drawingModule(
      () =>
        Promise.resolve(() => {
          throw new Error("no stage");
        }),
      () => true,
    )(testContext());
    await flush();
    expect(html.dataset.drawingWhy).toBe("load");
    expect(document.getElementById("anatomy")?.classList.contains("is-live")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
    stop();
  });

  it("keeps the session's floor: the quality reason stores tt.q = still", async () => {
    chapter(200);
    let ask = null as Ask | null;
    const stop = drawingModule((a) => {
      ask = a;
      return Promise.resolve(() => () => undefined);
    }, () => true)(testContext());
    await flush();
    ask?.still("quality");
    expect(window.sessionStorage.getItem("tt.q")).toBe("still");
    expect(html.dataset.drawingWhy).toBe("quality");
    stop();
  });

  it("puts a reader inside the chapter back at its start when it unpins under them", async () => {
    const { box } = chapter(200, 5000);
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    let ask = null as Ask | null;
    const stop = drawingModule((a) => {
      ask = a;
      return Promise.resolve(() => () => {
        box.height = 1200; // the pin's height goes with it, as the CSS does
      });
    }, () => true)(testContext());
    await flush();
    box.top = -900;
    ask?.still("webgl");
    expect(scrollTo).toHaveBeenCalledWith({ top: -900 + window.scrollY, behavior: "instant" });
    stop();
  });
});
