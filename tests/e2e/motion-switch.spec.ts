import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// The Motion switch (spec 2026-09-24 §3.A, §3.B). Motion is decided before first paint. Off stills the
// site's own movements exactly as the device's reduced-motion setting does, on every traveller page.

declare global {
  interface Window {
    __motionAtParse?: string | null;
  }
}

/** What <html data-motion> said the moment the document finished parsing: before React, before hydration. */
async function motionAtParse(page: Page, path: string): Promise<string | null | undefined> {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      window.__motionAtParse = document.documentElement.getAttribute("data-motion");
    });
  });
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__motionAtParse !== undefined);
  return page.evaluate(() => window.__motionAtParse);
}

test.describe("Motion is decided before first paint", () => {
  test("on by default", async ({ page }) => {
    expect(await motionAtParse(page, "/")).toBe("on");
  });

  test("off on every page once the reader has switched it off", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tt.motion", "off"));
    expect(await motionAtParse(page, "/watchlist")).toBe("off");
  });

  test("off when the device asks for reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await motionAtParse(page, "/")).toBe("off");
  });
});
