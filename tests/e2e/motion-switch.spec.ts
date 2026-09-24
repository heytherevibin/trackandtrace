import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { expectAxeClean, gotoReady } from "./helpers";

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

/** Holds the pointer down on a button and reads how far it settled: 1 means it did not move. */
async function heldScale(page: Page, target: Locator): Promise<number> {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  const scale = await target.evaluate((el) => {
    const t = getComputedStyle(el).transform;
    return t === "none" ? 1 : Number.parseFloat(t.slice(7));
  });
  // Release away from the button, so the press never runs a check.
  await page.mouse.move(0, 0);
  await page.mouse.up();
  return scale;
}

const STILLED_BY: Readonly<Record<string, (page: Page) => Promise<void>>> = {
  // Block body, not `(page) => page.addInitScript(...)`: addInitScript resolves to Promise<Disposable> on
  // this Playwright version, which does not satisfy Promise<void> from an expression body.
  "the reader switched Motion off": async (page) => {
    await page.addInitScript(() => window.localStorage.setItem("tt.motion", "off"));
  },
  "the device asks for reduced motion": (page) => page.emulateMedia({ reducedMotion: "reduce" }),
};

test.describe("Motion off stills the site's own movements", () => {
  for (const [why, still] of Object.entries(STILLED_BY)) {
    test(`when ${why}: a held button does not settle, nothing eases, anchors jump`, async ({ page }) => {
      await still(page);
      await gotoReady(page, "/");
      const run = page.getByRole("button", { name: "Run", exact: true }).first();
      expect(await run.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("1e-05s");
      expect(await heldScale(page, run)).toBe(1);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
    });
  }
});

/** Clicks the theme button in the page and returns the most distinct transforms any icon took over 30 frames. */
async function mostTurnsOfThemeIcon(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((done) => {
        const seen = new Map<Element, Set<string>>();
        const sample = (frame: number) => {
          for (const icon of document.querySelectorAll('header button[aria-label^="Theme"] > span > span')) {
            seen.set(icon, (seen.get(icon) ?? new Set<string>()).add(getComputedStyle(icon).transform));
          }
          if (frame < 30) requestAnimationFrame(() => sample(frame + 1));
          else done(Math.max(0, ...[...seen.values()].map((values) => values.size)));
        };
        document.querySelector<HTMLButtonElement>('header button[aria-label^="Theme"]')!.click();
        requestAnimationFrame(() => sample(1));
      }),
  );
}

test.describe("Motion's own animations follow Motion", () => {
  // The control: it passes before SiteMotion exists, and proves the sampler can see a turn at all.
  test("with Motion on, the theme icon turns through many frames as it changes", async ({ page }) => {
    await gotoReady(page, "/watchlist");
    expect(await mostTurnsOfThemeIcon(page)).toBeGreaterThan(3);
  });

  test("with Motion off, the icon changes at once, without turning", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tt.motion", "off"));
    await gotoReady(page, "/watchlist");
    expect(await mostTurnsOfThemeIcon(page)).toBeLessThanOrEqual(2);
    await expect(page.locator("html")).toHaveAttribute("data-theme", /light|dark/);
  });

  test("the page follows the device setting changing while it is open", async ({ page }) => {
    await gotoReady(page, "/");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
  });
});

test.describe("the footer's Motion switch", () => {
  const motionSwitch = (page: Page) => page.getByRole("contentinfo").getByRole("switch", { name: "Motion" });

  test("sits in the landing's footer, on; app pages' one-line footer has none", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(motionSwitch(page)).toBeChecked();
    await gotoReady(page, "/watchlist");
    await expect(motionSwitch(page)).toHaveCount(0);
  });

  test("off stills the site and holds across pages and visits; on again forgets it", async ({ page }) => {
    await gotoReady(page, "/");
    await motionSwitch(page).click();
    await expect(motionSwitch(page)).not.toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await gotoReady(page, "/watchlist");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await gotoReady(page, "/");
    await expect(motionSwitch(page)).not.toBeChecked();
    await motionSwitch(page).click();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "on");
    expect(await page.evaluate(() => window.localStorage.getItem("tt.motion"))).toBeNull();
  });

  test("under the device's reduced motion: off, disabled, says why, and axe is clean", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoReady(page, "/");
    await expect(motionSwitch(page)).not.toBeChecked();
    await expect(motionSwitch(page)).toHaveAttribute("aria-disabled", "true");
    await expect(motionSwitch(page)).toHaveAccessibleDescription("Your device asks for reduced motion");
    await expectAxeClean(page);
  });
});
