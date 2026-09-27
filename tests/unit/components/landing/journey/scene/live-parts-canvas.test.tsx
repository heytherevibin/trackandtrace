import { CanvasTexture, SRGBColorSpace } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boardFace } from "@/components/landing/journey/scene/departure";
import { glowTexture, radialTexture } from "@/components/landing/journey/scene/glow";
import { poolTexture } from "@/components/landing/journey/scene/beam";

// The two things the shared live-parts test only stubs past: the canvas work `radialTexture`/`glowTexture`/
// `poolTexture` (glow.ts) and `boardFace` (departure.ts) actually do. jsdom draws nothing, so this file stands
// in a fake 2D context that records every call, and asserts on what these functions told it to draw.

interface FillTextCall {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly font: string;
  readonly fillStyle: string;
}
interface FillRectCall {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly fillStyle: string;
}
class FakeGradient {
  readonly stops: Array<{ readonly offset: number; readonly color: string }> = [];
  addColorStop(offset: number, color: string): void {
    this.stops.push({ offset, color });
  }
}
class FakeCtx2D {
  fillStyle = "";
  font = "";
  textAlign = "";
  textBaseline = "";
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly fillTextCalls: FillTextCall[] = [];
  readonly fillRectCalls: FillRectCall[] = [];
  readonly clearRectCalls: Array<{ readonly x: number; readonly y: number; readonly w: number; readonly h: number }> = [];
  readonly gradients: FakeGradient[] = [];
  constructor(canvas: HTMLCanvasElement) {
    this.canvasWidth = canvas.width;
    this.canvasHeight = canvas.height;
  }
  clearRect(x: number, y: number, w: number, h: number): void {
    this.clearRectCalls.push({ x, y, w, h });
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.fillRectCalls.push({ x, y, w, h, fillStyle: this.fillStyle });
  }
  fillText(text: string, x: number, y: number): void {
    this.fillTextCalls.push({ text, x, y, font: this.font, fillStyle: this.fillStyle });
  }
  createRadialGradient(): FakeGradient {
    const g = new FakeGradient();
    this.gradients.push(g);
    return g;
  }
}

/** Stubs `getContext("2d")` to hand out one recording fake per canvas (matching a real canvas's caching), returning
 * every fake made so a test can inspect whichever canvas its function under test created. Restored in `afterEach`. */
function stubCanvas2D(): { readonly contexts: readonly FakeCtx2D[] } {
  const byCanvas = new WeakMap<HTMLCanvasElement, FakeCtx2D>();
  const contexts: FakeCtx2D[] = [];
  const impl = function (this: HTMLCanvasElement): CanvasRenderingContext2D {
    let ctx = byCanvas.get(this);
    if (!ctx) {
      ctx = new FakeCtx2D(this);
      byCanvas.set(this, ctx);
      contexts.push(ctx);
    }
    return ctx as unknown as CanvasRenderingContext2D;
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(impl as unknown as typeof HTMLCanvasElement.prototype.getContext);
  return { contexts };
}

const NOT_HEX = /^#/;

describe("glow.ts's radialTexture (a white alpha mask for a themed sprite to tint)", () => {
  let stub: { readonly contexts: readonly FakeCtx2D[] };
  beforeEach(() => {
    stub = stubCanvas2D();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws the given stops into a 128x128 radial gradient, filled edge to edge, with no hex colour", () => {
    const texture = radialTexture([
      [0, 1],
      [0.5, 0.4],
      [1, 0],
    ]);
    expect(texture).toBeInstanceOf(CanvasTexture);
    const ctx = stub.contexts[0]!;
    expect(ctx.canvasWidth).toBe(128);
    expect(ctx.canvasHeight).toBe(128);
    expect(ctx.gradients).toHaveLength(1);
    expect(ctx.gradients[0]!.stops).toEqual([
      { offset: 0, color: "rgba(255,255,255,1)" },
      { offset: 0.5, color: "rgba(255,255,255,0.4)" },
      { offset: 1, color: "rgba(255,255,255,0)" },
    ]);
    for (const { color } of ctx.gradients[0]!.stops) expect(color).not.toMatch(NOT_HEX);
    expect(ctx.fillRectCalls).toEqual([{ x: 0, y: 0, w: 128, h: 128, fillStyle: ctx.gradients[0] as unknown as string }]);
  });

  it("gives the headlight's glow and the beam's ballast pool two different fades, both delegating to radialTexture", () => {
    glowTexture();
    const glowStops = stub.contexts[0]!.gradients[0]!.stops;
    poolTexture();
    const poolStops = stub.contexts[1]!.gradients[0]!.stops;
    expect(glowStops).toEqual([
      { offset: 0, color: "rgba(255,255,255,1)" },
      { offset: 0.18, color: "rgba(255,255,255,0.55)" },
      { offset: 1, color: "rgba(255,255,255,0)" },
    ]);
    expect(poolStops).toEqual([
      { offset: 0, color: "rgba(255,255,255,0.9)" },
      { offset: 0.45, color: "rgba(255,255,255,0.28)" },
      { offset: 1, color: "rgba(255,255,255,0)" },
    ]);
    expect(poolStops).not.toEqual(glowStops);
  });
});

describe("departure.ts's boardFace (the nameboard's canvas texture)", () => {
  let stub: { readonly contexts: readonly FakeCtx2D[] };
  let realFonts: unknown;
  beforeEach(() => {
    stub = stubCanvas2D();
    realFonts = (document as unknown as { fonts?: unknown }).fonts;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(document, "fonts", { configurable: true, value: realFonts });
  });

  it("paints the verbatim platform words, in the given family, sized and placed as the code specifies", () => {
    const load = vi.fn().mockReturnValue(new Promise<never[]>(() => undefined));
    Object.defineProperty(document, "fonts", { configurable: true, value: { load } });

    const face = boardFace({ platform: "PLATFORM 3", departures: "DEPARTURES" }, "Condensed Sans");
    expect(face.texture).toBeInstanceOf(CanvasTexture);
    expect(face.texture.colorSpace).toBe(SRGBColorSpace);
    expect(face.texture.anisotropy).toBe(4);
    expect(load).toHaveBeenCalledWith("600 150px Condensed Sans");

    face.paint({ r: 1, g: 1, b: 1 });
    const ctx = stub.contexts[0]!;
    expect(ctx.canvasWidth).toBe(1024);
    expect(ctx.canvasHeight).toBe(256);
    expect(ctx.clearRectCalls).toEqual([{ x: 0, y: 0, w: 1024, h: 256 }]);
    expect(ctx.fillTextCalls).toEqual([
      { text: "PLATFORM 3", x: 512, y: 118, font: "600 150px Condensed Sans", fillStyle: "rgb(255 255 255)" },
      { text: "DEPARTURES", x: 512, y: 214, font: "600 44px Condensed Sans", fillStyle: "rgb(255 255 255)" },
    ]);
  });

  it("repaints once the condensed face has arrived, in the ink it was last painted with", async () => {
    let resolveLoad: () => void = () => undefined;
    const load = vi.fn().mockReturnValue(
      new Promise<never[]>((resolve) => {
        resolveLoad = () => resolve([]);
      }),
    );
    Object.defineProperty(document, "fonts", { configurable: true, value: { load } });

    const face = boardFace({ platform: "PLATFORM 3", departures: "DEPARTURES" }, "Condensed Sans");
    face.paint({ r: 0.2, g: 0.4, b: 0.6 });
    const ctx = stub.contexts[0]!;
    const paintedCalls = ctx.fillTextCalls.length;
    expect(paintedCalls).toBe(2);

    resolveLoad();
    await Promise.resolve();
    await Promise.resolve();

    expect(ctx.fillTextCalls.length).toBe(paintedCalls * 2);
    const repainted = ctx.fillTextCalls.slice(paintedCalls);
    expect(repainted.every((c) => c.fillStyle === "rgb(51 102 153)")).toBe(true);
  });
});
