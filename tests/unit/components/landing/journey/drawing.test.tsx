import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawingModule, startDrawing, type LoadLive } from "@/components/landing/journey/drawing";
import { DRAWING_EVENT, type DrawingDetail, type ResultDetail } from "@/components/landing/journey/journey-events";
import { keep, type JourneyContext } from "@/components/landing/journey/start-journey";

const html = document.documentElement;
const ctx = (motion: boolean): JourneyContext => ({ motion, intro: false, result: keep<ResultDetail | null>(null), still: keep({ columns: false, height: null }) });
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

  it("settles still with Motion on, because J4 has no live drawing to load", async () => {
    const stop = startDrawing(ctx(true));
    await vi.waitFor(() => expect(html.dataset.drawingWhy).toBe("load"));
    expect(html.dataset.drawing).toBe("still");
    stop();
  });

  it("never asks for the live drawing on Data Saver, or once the session fell to the floor", () => {
    const load = vi.fn<LoadLive>(() => Promise.reject(new Error("no")));
    html.dataset.saver = "on";
    let stop = drawingModule(load)(ctx(true));
    expect(html.dataset.drawingWhy).toBe("saver");
    stop();
    html.dataset.saver = "off";
    window.sessionStorage.setItem("tt.q", "still");
    stop = drawingModule(load)(ctx(true));
    expect(html.dataset.drawingWhy).toBe("quality");
    expect(load).not.toHaveBeenCalled();
    stop();
  });

  it("draws live when the live drawing loads, stops it on teardown, and follows its reasons", async () => {
    const liveStop = vi.fn();
    let ask = null as Parameters<LoadLive>[0] | null;
    const load = vi.fn<LoadLive>((a) => {
      ask = a;
      return Promise.resolve(liveStop);
    });
    const stop = drawingModule(load)(ctx(true));
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(html.dataset.drawing).toBe("live");
    ask?.still("webgl");
    expect(html.dataset.drawing).toBe("still");
    expect(liveStop).toHaveBeenCalledTimes(1);
    ask?.live("webgl");
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    stop();
  });

  it("stops a live drawing that arrives after the journey was torn down", async () => {
    const liveStop = vi.fn();
    let arrive: (t: () => void) => void = () => {};
    const stop = drawingModule(() => new Promise((resolve) => (arrive = resolve)))(ctx(true));
    stop();
    arrive(liveStop);
    await vi.waitFor(() => expect(liveStop).toHaveBeenCalledTimes(1));
  });

  it("writes back the drawing the boot script's own rule would choose on teardown, dropping data-drawing-why", async () => {
    // Motion on, no saver, no stored quality floor: the boot script's own rule (resolveDrawing) says "live".
    // The module still settles "still" at runtime, for its own reason ("load", since J4 has no live drawing) —
    // teardown must write back what a fresh mount's boot script would choose, not leave that runtime reason
    // stuck in the markup for the next mount to find (spec, J4-4 minor #4).
    const stop = startDrawing(ctx(true));
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

  it("keeps a reader inside the chapter at its start when the switch changes its height", () => {
    const section = document.createElement("section");
    section.id = "anatomy";
    document.body.append(section);
    const boxes = [
      { top: -300, bottom: 900, height: 1200 },
      { top: -300, bottom: 1200, height: 1500 },
    ];
    vi.spyOn(section, "getBoundingClientRect").mockImplementation(() => DOMRect.fromRect({ y: boxes[0].top, height: boxes.shift()?.height ?? 1500 }));
    Object.defineProperty(window, "scrollY", { value: 2000, configurable: true });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    startDrawing(ctx(false))();
    expect(scrollTo).toHaveBeenCalledWith({ top: 1700, behavior: "instant" });
  });
});
