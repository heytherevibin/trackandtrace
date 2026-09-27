import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WEBGL_EVENT, type WebglDetail } from "@/components/landing/journey/journey-events";
import { createEngine } from "@/components/landing/journey/scene/engine";
import type { ScenePalette } from "@/components/landing/journey/scene/palette";

// createEngine's own memory of a lost GPU (J5-4): the engine outlives every rebuild, and a drawing module built
// while the context is gone has heard no "lost" of its own, so it asks the engine. jsdom has no WebGL: three's
// renderer is stood in for by one that draws nothing and reports whether its context is gone.

const gpu = vi.hoisted(() => ({ gone: false }));
// What each throwaway draw saw: whether every object was shown and none culled; and the pixel box it drew into.
const draws = vi.hoisted(() => ({ seen: [] as Array<{ allShown: boolean; noneCulled: boolean; box: string }>, box: "", textures: [] as unknown[] }));

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
    setScissorTest(): void {}
    setViewport(): void {}
    setScissor(x: number, y: number, w: number, h: number): void {
      draws.box = `${x},${y},${w},${h}`;
    }
    clear(): void {}
    initTexture(texture: unknown): void {
      draws.textures.push(texture);
    }
    render(scene: import("three").Object3D): void {
      let allShown = true;
      let noneCulled = true;
      scene.traverse((o) => {
        allShown &&= o.visible;
        noneCulled &&= !o.frustumCulled;
      });
      draws.seen.push({ allShown, noneCulled, box: draws.box });
      order.push("draw");
    }
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

// What the build did, in order: each wait for the page, and the world's build starting.
const order = vi.hoisted(() => [] as string[]);
vi.mock("@/components/landing/journey/scene/world", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/landing/journey/scene/world")>();
  return {
    ...real,
    buildWorldAsync: (...args: Parameters<typeof real.buildWorldAsync>) => {
      order.push("world");
      return real.buildWorldAsync(...args);
    },
  };
});

const INK = { r: 0, g: 0, b: 0 };
const palette: ScenePalette = { night: false, ground: INK, ink: INK, steel: INK, steelText: INK, scanDark: INK, scanLight: INK };
const options = { palette, coaches: 1, words: { platform: "Platform", departures: "Departures" }, family: "serif" };
const pause = () => Promise.resolve();
const heard: WebglDetail[] = [];
const hear = (e: Event) => heard.push((e as CustomEvent<WebglDetail>).detail);

beforeEach(() => {
  gpu.gone = false;
  draws.seen.length = 0;
  draws.textures.length = 0;
  heard.length = 0;
  window.addEventListener(WEBGL_EVENT, hear);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  Object.defineProperty(document, "fonts", { configurable: true, value: { load: () => Promise.resolve([]) } });
});
afterEach(() => {
  window.removeEventListener(WEBGL_EVENT, hear);
  vi.restoreAllMocks();
});

describe("the engine's build, a step at a time (spec §3.H: scene steps ≤ 61 ms at 4× CPU)", () => {
  it("waits for the page before its first step (the scene's chunk is evaluated in the task that asks for it), and around the warm-up draw", async () => {
    order.length = 0;
    const engine = await createEngine(document.createElement("canvas"), options, async () => {
      order.push("pause");
    });
    expect(order.slice(0, 2)).toEqual(["pause", "world"]);
    expect(order.slice(-3)).toEqual(["pause", "draw", "pause"]); // the drawing's start gets a task of its own
    engine.dispose();
  });

  it("warms by drawing once, every object shown and none culled, into one pixel, then puts each back", async () => {
    const engine = await createEngine(document.createElement("canvas"), options, pause);
    // the first frame on screen would otherwise upload every buffer and texture it meets (a phone's first frame of
    // the drawing: 50-60 ms at 4× CPU), so the build does it, in a step of its own
    expect(draws.seen).toEqual([{ allShown: true, noneCulled: true, box: "0,0,1,1" }]);
    const { scene, rig } = engine.world;
    expect(rig.group.getObjectByName("beam")?.visible).toBe(false); // hidden again (withEverythingShown: engine.test)
    expect(scene.getObjectByName("departure")?.visible).toBe(false);
    const maps = new Set<unknown>();
    scene.traverse((o) => {
      const material: unknown = Reflect.get(o, "material");
      for (const m of Array.isArray(material) ? material : [material]) {
        const map: unknown = m && typeof m === "object" ? Reflect.get(m, "map") : null;
        if (map) maps.add(map);
      }
    });
    expect(maps.size).toBeGreaterThanOrEqual(3); // the nameboard, the glow and the pool
    expect(new Set(draws.textures)).toEqual(maps);
    engine.dispose();
  });
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
    expect(draws.seen).toEqual([]); // nothing is warmed on a lost context
    expect(heard).toEqual(["lost"]);
    engine.dispose();
  });
});
