import { describe, expect, it } from "vitest";
import { entranceStep } from "@/components/landing/journey/entrances";

const VH = 800;
const box = (top: number, height = 400) => ({ top, bottom: top + height });

describe("entranceStep", () => {
  it("leaves a trigger at rest while any of it is in the window", () => {
    expect(entranceStep("rest", box(100), VH, 0.88)).toBeNull();
    expect(entranceStep("rest", box(-399), VH, 0.88)).toBeNull();
    expect(entranceStep("rest", box(799), VH, 0.88)).toBeNull();
  });

  it("arms a trigger only once it has wholly left the window, above or below", () => {
    expect(entranceStep("rest", box(-400), VH, 0.88)).toBe("arm");
    expect(entranceStep("rest", box(800), VH, 0.88)).toBe("arm");
  });

  it("plays an armed trigger when it comes into the band from below", () => {
    expect(entranceStep("armed", box(720), VH, 0.88)).toBeNull();
    expect(entranceStep("armed", box(700), VH, 0.88)).toBe("play");
  });

  it("plays an armed trigger when it comes back from above", () => {
    expect(entranceStep("armed", box(-330), VH, 0.88)).toBeNull();
    expect(entranceStep("armed", box(-300), VH, 0.88)).toBe("play");
  });

  it("keeps an armed trigger armed while it is still out of sight", () => {
    expect(entranceStep("armed", box(-2000), VH, 0.88)).toBeNull();
    expect(entranceStep("armed", box(3000), VH, 0.88)).toBeNull();
  });
});
