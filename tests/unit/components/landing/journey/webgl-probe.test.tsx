import { afterEach, describe, expect, it, vi } from "vitest";
import { webgl2 } from "@/components/landing/journey/webgl-probe";

afterEach(() => vi.restoreAllMocks());

describe("webgl2", () => {
  it("is true only for a WebGL 2 context, and hands that context straight back", () => {
    const loseContext = vi.fn();
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ getExtension: () => ({ loseContext }) } as unknown as WebGL2RenderingContext);
    expect(webgl2()).toBe(true);
    expect(loseContext).toHaveBeenCalledTimes(1);
    spy.mockReturnValue(null);
    expect(webgl2()).toBe(false);
    spy.mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(webgl2()).toBe(false);
  });
});
