import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WEBGL_EVENT, type WebglDetail } from "@/components/landing/journey/journey-events";
import { createEngine } from "@/components/landing/journey/scene/engine";
import type { ScenePalette } from "@/components/landing/journey/scene/palette";

// createEngine's own memory of a lost GPU (J5-4): the engine outlives every rebuild, and a drawing module built
// while the context is gone has heard no "lost" of its own, so it asks the engine. jsdom has no WebGL: three's
// renderer is stood in for by one that draws nothing and reports whether its context is gone.

const gpu = vi.hoisted(() => ({ gone: false }));

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<typeof import("three")>();
  class StandInRenderer {
    autoClear = true;
    localClippingEnabled = false;
    setClearColor(): void {}
    setPixelRatio(): void {}
    getPixelRatio(): number {
      return 1;
    }
    setSize(): void {}
    compileAsync(): Promise<void> {
      return Promise.resolve();
    }
    getContext(): { isContextLost(): boolean } {
      return { isContextLost: () => gpu.gone };
    }
    dispose(): void {}
    forceContextLoss(): void {}
  }
  return { ...three, WebGLRenderer: StandInRenderer };
});

const INK = { r: 0, g: 0, b: 0 };
const palette: ScenePalette = { night: false, ground: INK, ink: INK, steel: INK, steelText: INK, scanDark: INK, scanLight: INK };
const options = { palette, coaches: 1, words: { platform: "Platform", departures: "Departures" }, family: "serif" };
const pause = () => Promise.resolve();
const heard: WebglDetail[] = [];
const hear = (e: Event) => heard.push((e as CustomEvent<WebglDetail>).detail);

beforeEach(() => {
  gpu.gone = false;
  heard.length = 0;
  window.addEventListener(WEBGL_EVENT, hear);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  Object.defineProperty(document, "fonts", { configurable: true, value: { load: () => Promise.resolve([]) } });
});
afterEach(() => {
  window.removeEventListener(WEBGL_EVENT, hear);
  vi.restoreAllMocks();
});

describe("the engine remembers a lost GPU (J5-4)", () => {
  it("is lost between the context's lost and restored, and says so", async () => {
    const canvas = document.createElement("canvas");
    const engine = await createEngine(canvas, options, pause);
    expect(engine.lost()).toBe(false);
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(engine.lost()).toBe(true);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(engine.lost()).toBe(false);
    expect(heard).toEqual(["lost", "restored"]);
    engine.dispose();
  });

  it("is lost from the start when the context went while it was being built", async () => {
    gpu.gone = true;
    const engine = await createEngine(document.createElement("canvas"), options, pause);
    expect(engine.lost()).toBe(true);
    expect(heard).toEqual(["lost"]);
    engine.dispose();
  });
});
