import { expect, test, type Page } from "@playwright/test";
import { JOURNEY_CHUNK_MARK } from "@/components/landing/journey/journey-mark";
import { collisionsInView } from "./collisions";
import { motionOff, scrollToId, waitForJourney } from "./journey-helpers";

const PANELS = { panels: [".board", ".berth-plan", ".station-clock", ".route-map", ".chapter-card"], skip: [".hero-dial"] };

/** Waits for window.scrollY to stop moving: in-page anchors glide (base.css) once the journey has started
 * (before that, journey.css lands them instantly), and a glide can still be settling for several hundred ms
 * after its target first enters the viewport. */
async function waitForScrollSettled(page: Page): Promise<void> {
  let last = -1;
  for (let i = 0; i < 20; i++) {
    const y = await page.evaluate(() => window.scrollY);
    if (y === last) return;
    last = y;
    await page.waitForTimeout(100);
  }
}

async function throughHow(page: Page, fractions: readonly number[]): Promise<string[]> {
  const found: string[] = [];
  for (const f of fractions) {
    await page.evaluate((frac) => {
      const how = document.getElementById("how")!;
      const top = how.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + (how.offsetHeight - window.innerHeight) * frac, behavior: "instant" });
    }, f);
    await page.waitForTimeout(250);
    found.push(...(await collisionsInView(page, PANELS)).map((c) => `@${f}: ${c}`));
  }
  return found;
}

test.describe("02 · the chapters, pinned", () => {
  test("holds under the masthead and plays its three stops as the page scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    const headerBottom = await page.locator("header").evaluate((h) => Math.round(h.getBoundingClientRect().bottom));
    for (const [f, stop, card] of [[0.1, "0", "01 / 03"], [0.5, "1", "02 / 03"], [0.95, "2", "03 / 03"]] as const) {
      await page.evaluate((frac) => {
        const how = document.getElementById("how")!;
        window.scrollTo({ top: how.getBoundingClientRect().top + window.scrollY + (how.offsetHeight - window.innerHeight) * frac, behavior: "instant" });
      }, f);
      await expect(page.locator(`#how li[data-chapter="${stop}"]`)).toHaveClass(/is-current/);
      await expect(page.locator("#how .chapter-step-count")).toHaveText(card);
      const pinTop = await page.locator("#how .chapters-pin").evaluate((p) => Math.round(p.getBoundingClientRect().top));
      expect(Math.abs(pinTop - headerBottom)).toBeLessThanOrEqual(2);
    }
  });

  test("never collides while it plays: desktop, short desktop, phone, and a phone on its side", async ({ page }) => {
    for (const size of [{ width: 1440, height: 900 }, { width: 1440, height: 600 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await page.goto("/");
      await waitForJourney(page);
      expect(await throughHow(page, [0, 0.2, 0.4, 0.6, 0.8, 1]), `${size.width}×${size.height}`).toEqual([]);
    }
  });

  test("Motion off: a plain section", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    await scrollToId(page, "how");
    await expect(page.locator("#how")).not.toHaveClass(/is-pinned/);
    await expect(page.locator("#how .chapters-instrument")).toBeHidden();
  });

  test("switching Motion keeps the reader where they were", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    await page.waitForTimeout(300);
    const headerBottom = await page.locator("header").evaluate((h) => Math.round(h.getBoundingClientRect().bottom));
    const target = headerBottom + 100;
    await scrollToId(page, "features", target);
    // Lets chapters.ts's place guard (startPlaceGuard) catch up: it learns the reader's position off
    // the window's own "scroll" event, which this environment delivers as a throttled task rather than on
    // this frame, so the toggle below must wait for it to land before it can rely on that position.
    await page.waitForTimeout(200);

    // Drives Motion the way chooseMotion (use-motion.ts) does, without the footer switch: that control sits at
    // the very foot of the page, and Playwright's click auto-scrolls it into view first, which would confound
    // the very position this test is checking.
    await page.evaluate(() => {
      window.localStorage.setItem("tt.motion", "off");
      document.documentElement.setAttribute("data-motion", "off");
      window.dispatchEvent(new Event("tt:motion"));
    });
    await page.waitForTimeout(300);
    await expect(page.locator("#how")).not.toHaveClass(/is-pinned/);
    let top = await page.locator("#features").evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(top - target)).toBeLessThanOrEqual(4);

    await page.evaluate(() => {
      window.localStorage.removeItem("tt.motion");
      document.documentElement.setAttribute("data-motion", "on");
      window.dispatchEvent(new Event("tt:motion"));
    });
    await page.waitForTimeout(300);
    // Motion re-enabling does not, by itself, re-pin #how here: the reader is still below its start (at
    // #features), and pinning is deferred until they scroll back above it (spec §3.A) — the point of that
    // deferral is exactly that this toggle must not grow #how under them, so nothing moves either way.
    await expect(page.locator("#how")).not.toHaveClass(/is-pinned/);
    top = await page.locator("#features").evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(top - target)).toBeLessThanOrEqual(4);
  });

  test("a reader who scrolls away before the journey starts is left where they are", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Delays the one script chunk that carries the journey (found by its content, so its hashed name never
    // matters — the same mark blockJourneyChunk uses), instead of aborting it: the browser's own fragment
    // scroll for /#faq, and the reader's own scroll to #roadmap after it, both need time to happen before
    // the journey chunk finally loads and #how first pins.
    await page.route("**/_next/static/**/*.js", async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      if (body.includes(JOURNEY_CHUNK_MARK)) await new Promise((resolve) => setTimeout(resolve, 2500));
      await route.fulfill({ response, body });
    });
    await page.goto("/#faq");
    await expect(page.locator("#faq")).toBeInViewport();
    await waitForScrollSettled(page);
    const headerBottom = await page.locator("header").evaluate((h) => Math.round(h.getBoundingClientRect().bottom));
    const target = headerBottom + 100;
    await scrollToId(page, "roadmap", target);
    await waitForJourney(page);
    const top = await page.locator("#roadmap").evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(top - target)).toBeLessThanOrEqual(4);
  });

  test("on /#faq, 02 never pins under the reader, and #faq stays where the link landed it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Records every moment #how carries .is-pinned, however briefly: a class added and removed within one task
    // shows up in the removal's old value.
    await page.addInitScript(() => {
      const w = window as unknown as { __howPinned: boolean };
      w.__howPinned = false;
      new MutationObserver((records) => {
        for (const r of records) {
          if (!(r.target instanceof Element) || r.target.id !== "how") continue;
          if (r.target.classList.contains("is-pinned") || /\bis-pinned\b/.test(r.oldValue ?? "")) w.__howPinned = true;
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    });
    await page.goto("/#faq");
    const faq = page.locator("#faq");
    const offLanding = () => faq.evaluate((el) => Math.abs(el.getBoundingClientRect().top - Number.parseFloat(getComputedStyle(el).scrollMarginTop)));
    await expect.poll(offLanding).toBeLessThanOrEqual(4);
    await waitForJourney(page);
    await page.waitForTimeout(1000);
    expect(await offLanding()).toBeLessThanOrEqual(4);
    expect(await page.evaluate(() => (window as unknown as { __howPinned: boolean }).__howPinned)).toBe(false);
  });

  test("an anchor clicked on the board lands its section, and 02 stays pinned", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
    await page.locator('.board a[href="#reliability"]').click();
    await page.waitForTimeout(300);
    await waitForScrollSettled(page);
    // The landing as the app defines it: the section's scroll-margin (base.css: the masthead's height and 1rem).
    const off = await page
      .locator("#reliability")
      .evaluate((el) => Math.abs(el.getBoundingClientRect().top - Number.parseFloat(getComputedStyle(el).scrollMarginTop)));
    expect(off).toBeLessThanOrEqual(4);
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
  });

  test("a window that grows tall enough never pins 02 while the reader is below it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 360 });
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator("#how")).not.toHaveClass(/is-pinned/);
    await scrollToId(page, "faq", 120);
    await page.waitForTimeout(300);
    const before = await page.locator("#faq").evaluate((el) => el.getBoundingClientRect().top);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);
    expect(await page.locator("#how").getAttribute("class")).not.toMatch(/is-pinned/);
    const after = await page.locator("#faq").evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(4);
  });

  test("02 pins once the reader scrolls back above it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/#faq");
    await waitForJourney(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(page.locator("#how")).toHaveClass(/is-pinned/);
  });
});
