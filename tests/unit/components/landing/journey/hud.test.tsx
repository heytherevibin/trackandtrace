import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { frameStats, startHud } from "@/components/landing/journey/hud";
import { hudAllowed } from "@/components/landing/journey/hud-gate";
import { HUD_CHUNK_MARK } from "@/components/landing/journey/hud-mark";

describe("the frame meter (J5-10)", () => {
  afterEach(() => document.body.replaceChildren());

  it("is allowed on preview deployments and in development, never in production", () => {
    expect(hudAllowed({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(true); // a preview build always allows it
    expect(hudAllowed({ VERCEL_ENV: undefined, NODE_ENV: "development" })).toBe(true); // a plain `next dev`, nothing set by Vercel
    expect(hudAllowed({ VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(false); // a Vercel production build
    expect(hudAllowed({ VERCEL_ENV: undefined, NODE_ENV: "production" })).toBe(false); // a self-hosted production build: no VERCEL_ENV at all
    expect(hudAllowed({ VERCEL_ENV: undefined, NODE_ENV: "test" })).toBe(false); // the unit/e2e runner's own NODE_ENV: not development, so not allowed either
  });

  it("is decided from the environment the page already parsed, never from process.env read directly (services/env.ts)", () => {
    const page = readFileSync(join(process.cwd(), "src/app/(site)/page.tsx"), "utf8");
    expect(page).not.toMatch(/process\.env/);
    expect(page).toMatch(/hudAllowed\(current\)/);
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
  it("carries its chunk's mark on its own root, so the chunk budgets can tell its chunk apart (J6-15)", () => {
    const stop = startHud();
    expect(document.querySelector<HTMLElement>(".journey-hud")?.dataset.chunk).toBe(HUD_CHUNK_MARK);
    stop();
  });
});
