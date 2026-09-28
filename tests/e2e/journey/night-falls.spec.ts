import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { atRest, motionOff, noAnchoring, scrollIntoChapter, scrollIntoRun, scrollToId, waitForJourney, waitForLive } from "./journey-helpers";

// Night falls (spec §3.F, §5's "theme sweep"; J6-10): the theme button's change sweeps out from it in a widening circle,
// the drawn train redrawn inside it. Every clip-path animation on ::view-transition-new(root) is recorded as it starts.

interface Sweep {
  readonly clip: readonly string[];
}

async function recordSweeps(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sweeps: Sweep[] = [];
    Reflect.set(window, "__ttSweeps", sweeps);
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (this: Element, keyframes, options) {
      if (typeof options === "object" && options.pseudoElement === "::view-transition-new(root)" && keyframes && !Array.isArray(keyframes)) {
        const clip = Reflect.get(keyframes, "clipPath");
        if (Array.isArray(clip)) sweeps.push({ clip: clip.map(String) });
      }
      return animate.call(this, keyframes, options);
    };
  });
}
const sweeps = (page: Page) => page.evaluate(() => (Reflect.get(window, "__ttSweeps") ?? []) as Sweep[]);
const themeButton = (page: Page) => page.getByRole("banner").getByRole("button", { name: /^Theme:/ });

test.describe("Night falls (spec §3.F)", () => {
  test.skip(({ isMobile }) => isMobile, "the masthead's theme button at a desktop width; one project is enough");

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tt.theme", "light"));
  });

  test("the new theme sweeps out from the theme button in a circle, and the drawn train redraws inside it", async ({ page }) => {
    await recordSweeps(page);
    await page.goto("/");
    await waitForLive(page);
    const box = (await themeButton(page).boundingBox())!;
    await themeButton(page).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(async () => (await sweeps(page)).length).toBe(1);
    const [sweep] = await sweeps(page);
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    expect(sweep!.clip[0]).toBe(`circle(0px at ${x}px ${y}px)`);
    expect(sweep!.clip[1]).toMatch(new RegExp(`^circle\\(\\d+px at ${x}px ${y}px\\)$`));
    await expect.poll(() => page.evaluate(() => window.__ttJourney?.night() ?? false)).toBe(true);
    await expect(page.locator("html")).not.toHaveAttribute("data-theme-sweep");
  });

  test("clicks land while the sweep runs", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    await themeButton(page).click();
    // at once, while the circle widens: ::view-transition lets pointer events through to the page (motion.css)
    await page.locator(".board").getByRole("link", { name: "Operating principles" }).click();
    await expect(page).toHaveURL(/#principles$/);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("Motion off: the switch is instant", async ({ page }) => {
    await recordSweeps(page);
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await themeButton(page).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await sweeps(page)).toEqual([]);
    await expect(page.locator("html")).not.toHaveAttribute("data-theme-sweep");
  });

  test("a browser without View Transitions: the switch is instant", async ({ page }) => {
    await recordSweeps(page);
    await page.addInitScript(() => Reflect.deleteProperty(Document.prototype, "startViewTransition"));
    await page.goto("/");
    await waitForJourney(page);
    await themeButton(page).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await sweeps(page)).toEqual([]);
  });

  // The console never sweeps by construction: its layout writes no data-motion (night-falls.ts's gate).
  test("every other traveller page sweeps too", async ({ page }) => {
    await recordSweeps(page);
    await page.goto("/watchlist");
    await page.locator("html[data-hydrated]").waitFor({ timeout: 15_000 });
    await themeButton(page).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect.poll(async () => (await sweeps(page)).length).toBe(1);
  });

  // A theme change never moves the reader (J6 Task 7): the toggle is a button, so its click is no Tab stop's glide
  // (focus-glide.ts) and no place-keeping jump (keep-place.ts), and nothing the new theme redraws changes a height
  // above them. Wherever they are, in the drawing, in the run or below both, with scroll anchoring on and off.
  for (const anchoring of ["on", "off"] as const)
    for (const at of ["anatomy", "run", "record"] as const) {
      test(`the reader stays where they are in #${at} across the sweep (scroll anchoring ${anchoring})`, async ({ page }) => {
        if (anchoring === "off") await noAnchoring(page);
        await recordSweeps(page);
        await page.goto("/");
        await waitForLive(page);
        if (at === "anatomy") await scrollIntoChapter(page, 0.5);
        else if (at === "run") await scrollIntoRun(page, 0.5);
        else await scrollToId(page, at, 100);
        await atRest(page);
        const place = () => page.evaluate((id) => ({ y: window.scrollY, top: document.getElementById(id)?.getBoundingClientRect().top ?? Number.NaN }), at);
        const before = await place();
        await themeButton(page).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
        await expect.poll(async () => (await sweeps(page)).length).toBe(1);
        await expect(page.locator("html")).not.toHaveAttribute("data-theme-sweep");
        await atRest(page);
        const after = await place();
        expect(after.y, "the page's scroll").toBe(before.y);
        expect(after.top, `#${at}'s place in the window`).toBeCloseTo(before.top, 0);
      });
    }
});
