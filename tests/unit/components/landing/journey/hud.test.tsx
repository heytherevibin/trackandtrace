import { afterEach, describe, expect, it } from "vitest";
import { frameStats, startHud } from "@/components/landing/journey/hud";
import { hudAllowed } from "@/components/landing/journey/hud-gate";

describe("the frame meter (J5-10)", () => {
  afterEach(() => document.body.replaceChildren());

  it("is allowed on preview deployments and in development, never in production", () => {
    expect(hudAllowed("preview", "production")).toBe(true);
    expect(hudAllowed(undefined, "development")).toBe(true);
    expect(hudAllowed("production", "production")).toBe(false);
    expect(hudAllowed(undefined, "production")).toBe(false);
  });

  it("reads frame rate, p95, slow frames and the last ten seconds' long tasks", () => {
    const frames = [...Array.from({ length: 90 }, () => 16), ...Array.from({ length: 10 }, () => 40)];
    expect(frameStats(frames, [{ at: 1_000, ms: 90 }, { at: 12_000, ms: 130 }], 15_000)).toEqual({ fps: 63, p95: 40, slow: 10, longs: 1, longMax: 130 });
    expect(frameStats([], [], 0)).toEqual({ fps: 0, p95: 0, slow: 0, longs: 0, longMax: 0 });
  });

  it("says which drawing is shown and why, in the review's own words, and closes", () => {
    document.documentElement.dataset.drawing = "still";
    document.documentElement.dataset.drawingWhy = "saver";
    const stop = startHud();
    const hud = document.querySelector(".journey-hud");
    expect(hud).not.toBeNull();
    const text = hud?.querySelector("pre")?.textContent ?? "";
    expect(text).toContain("drawing still (data saver)");
    expect(text).not.toContain("quality"); // the quality step is a live drawing's
    expect(text).toMatch(/^fps \d+ {3}p95 [\d.]+ ms {3}slow [\d.]+%$/m);
    hud?.querySelector<HTMLButtonElement>('button[aria-label="Close the frame meter"]')?.click();
    expect(document.querySelector(".journey-hud")).toBeNull();
    stop();
    delete document.documentElement.dataset.drawing;
    delete document.documentElement.dataset.drawingWhy;
  });
});
