import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { PNR } from "../helpers";
import { blockJourneyChunk, waitForJourney } from "./journey-helpers";

/** `<html data-scroll-behavior="smooth">` (base.css) animates every focus-driven scroll; without this, reading
 * the focused element's geometry mid-animation reports positions no reader ever actually sees it at. */
async function waitForScrollSettled(page: Page): Promise<void> {
  let last = -1;
  for (let tries = 0; tries < 40; tries += 1) {
    const y = await page.evaluate(() => window.scrollY);
    if (y === last) return;
    last = y;
    await page.waitForTimeout(50);
  }
}

/** Whether the focused element is actually hidden: something else paints over its centre. A fixed overlay
 * drawn on top (the skip link, above the masthead by z-index) is never "hidden" just because its box sits in
 * the masthead's own vertical band — only `elementFromPoint` returning neither the element nor one of its
 * own descendants (an icon inside a button, say) counts as a real cover. The cursor and every drawing have
 * `pointer-events: none`, so a drawing on top never trips this either. `nextjs-portal` hosts the dev-only
 * toolbar (collisions.ts ignores it too, spec 2026-09-24 §5); it never ships to production and a reader never
 * tabs to anything inside it. Evaluated in the page, not called from Node. */
function coveredFocusLabel(): string | null {
  const el = document.activeElement;
  if (!el || el === document.body || el.tagName === "NEXTJS-PORTAL") return null;
  const r = el.getBoundingClientRect();
  const x = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
  const y = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1);
  const top = document.elementFromPoint(x, y);
  const covered = top !== null && top !== el && !el.contains(top);
  return covered ? `${el.tagName} ${el.textContent?.trim().slice(0, 40)}` : null;
}

test.describe("the journey island", () => {
  test("starts once the page is idle", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
  });

  test("a blocked journey chunk leaves the page still, and the check still works", async ({ page }) => {
    await blockJourneyChunk(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-journey", "failed", { timeout: 15_000 });
    const plate = page.getByTestId("hero-instrument");
    await plate.getByRole("textbox").fill(PNR.cnf);
    await plate.getByRole("button", { name: /run/i }).click();
    await expect(page.getByTestId("terminal-result")).toBeVisible();
  });

  test("never starts on other pages", async ({ page }) => {
    await page.goto("/accuracy");
    await page.waitForTimeout(2_000);
    await expect(page.locator("html")).not.toHaveAttribute("data-journey", /.+/);
  });
});

for (const blocked of [false, true]) {
  test(`every sample check reads its record with the journey ${blocked ? "blocked" : "on"}`, async ({ page }) => {
    if (blocked) await blockJourneyChunk(page);
    await page.goto("/");
    const plate = page.getByTestId("hero-instrument");
    for (const pnr of [PNR.cnf, PNR.rac, PNR.wl, PNR.mixed, PNR.notFound]) {
      await plate.getByRole("textbox").fill(pnr);
      await plate.getByRole("button", { name: /run/i }).click();
      const result = page.getByTestId("terminal-result");
      await expect(result).toBeVisible();
      // Visible alone also passes for limited, refused and unavailable: this proves the record was actually
      // read, not just that some terminal state rendered.
      await expect(result).toHaveAttribute("data-kind", pnr === PNR.notFound ? "notfound" : "ok");
      await page.getByRole("button", { name: /check another pnr/i }).click();
    }
  });
}

test("Tab never leaves focus under the masthead or behind a pinned piece", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await waitForJourney(page);
  for (let i = 0; i < 80; i += 1) {
    await page.keyboard.press("Tab");
    await waitForScrollSettled(page);
    expect(await page.evaluate(coveredFocusLabel)).toBeNull();
  }
});

test("the check still catches a real cover: an in-flow link scrolled in under the sticky masthead", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  // Focusable elements never get base.css's scroll-margin-top (deliberately — see its own comment), so an
  // ordinary in-flow link can sit flush behind the sticky masthead once focused. Scrolled and focused directly
  // here, rather than by tabbing there, so the scenario is exact instead of depending on tab order. The link
  // is Reliability's "Read the data policy" — mid-page, with plenty of section below it to scroll through, so
  // the target scroll position is never clamped by the document's end (unlike a footer link, which is at the
  // very bottom and cannot be scrolled any higher than its own resting place).
  await page.evaluate(() => {
    const link = document.querySelector('#reliability a[href="/accuracy"]') as HTMLElement;
    const headerBottom = document.querySelector("header")!.getBoundingClientRect().bottom;
    const linkTop = link.getBoundingClientRect().top;
    window.scrollTo({ top: window.scrollY + linkTop - headerBottom / 2, behavior: "instant" });
    link.focus();
  });
  expect(await page.evaluate(coveredFocusLabel)).not.toBeNull();
});
