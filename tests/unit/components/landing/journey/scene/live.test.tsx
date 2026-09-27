import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Ask } from "@/components/landing/journey/drawing";
import { boardFace } from "@/components/landing/journey/scene/departure";
import { SCENE_CHUNK_MARK, prepareLive } from "@/components/landing/journey/scene/live";
import type { Teardown } from "@/components/landing/journey/start-journey";
import { testContext } from "../journey-context";

// The scene chunk's door (scene/live.ts): the engine it builds once per journey, from the page's own words and the
// theme's tokens, on a canvas it owns (J5 pre-flight #11). jsdom has no WebGL: three's renderer is stood in for by one
// that draws nothing, so the engine's real build runs. The live chapter itself is proved in e2e (live-drawing.spec).

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
    setScissor(): void {}
    clear(): void {}
    initTexture(): void {}
    render(): void {}
    compileAsync(): Promise<void> {
      return Promise.resolve();
    }
    getContext(): { isContextLost(): boolean } {
      return { isContextLost: () => false };
    }
    dispose(): void {}
    forceContextLoss(): void {}
  }
  return { ...three, WebGLRenderer: StandInRenderer };
});

vi.mock("@/components/landing/journey/scene/departure", async (importOriginal) => {
  const departure = await importOriginal<typeof import("@/components/landing/journey/scene/departure")>();
  return { ...departure, boardFace: vi.fn(departure.boardFace) };
});

const TOKENS = { "--surface-0": "#f4f1ea", "--ink-1": "#1b1b1b", "--accent": "#2f5d8a", "--accent-text": "#24496d" } as const;
const ask: Ask = { still: () => undefined, live: () => undefined };
const canvas = () => document.getElementById("journey-canvas");

beforeEach(() => {
  for (const [token, value] of Object.entries(TOKENS)) document.documentElement.style.setProperty(token, value);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  Object.defineProperty(document, "fonts", { configurable: true, value: { load: () => Promise.resolve([]) } });
});
afterEach(() => {
  document.documentElement.removeAttribute("style");
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("the scene chunk's door (scene/live.ts)", () => {
  it("carries the mark an e2e test blocks it by", () => {
    expect(SCENE_CHUNK_MARK).toBe("tt-scene-chunk");
  });

  it("paints the nameboard in the page's own words, verbatim from v3 (J5-6)", async () => {
    const ends: Teardown[] = [];
    await prepareLive(ask, testContext({ atEnd: (stop) => ends.push(stop) }));
    expect(vi.mocked(boardFace)).toHaveBeenCalledWith({ platform: "PLATFORM 3", departures: "DEPARTURES" }, expect.any(String));
    for (const end of ends) end();
  });

  it("builds the engine once a journey, on a hidden canvas of its own, and takes the canvas away when the journey ends", async () => {
    const ends: Teardown[] = [];
    const ctx = testContext({ atEnd: (stop) => ends.push(stop) });
    await prepareLive(ask, ctx);
    const held = ctx.scene.get();
    expect(held).not.toBeNull();
    expect(canvas()?.hidden).toBe(true); // shown only while the chapter is live
    expect(canvas()?.getAttribute("aria-hidden")).toBe("true");
    await prepareLive(ask, ctx); // a rebuild reuses the journey's engine (J5-4)
    expect(ctx.scene.get()).toBe(held);
    expect(document.querySelectorAll("#journey-canvas")).toHaveLength(1);
    const engine = await held;
    const dispose = vi.spyOn(engine!, "dispose");
    for (const end of ends) end();
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(canvas()).toBeNull();
  });

  it("will not build on colours it cannot read", async () => {
    document.documentElement.style.setProperty("--ink-1", "not a colour");
    await expect(prepareLive(ask, testContext())).rejects.toThrow("the theme's colour tokens did not parse");
    expect(canvas()).toBeNull();
  });
});
