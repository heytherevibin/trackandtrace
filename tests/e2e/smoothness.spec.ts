import { expect, test } from "./fixtures";
import { enterPnr, gotoReady } from "./helpers";

// Page switches jump straight to the top (no smooth-scroll animation during a route change), the
// theme button eases back from its press even as the theme changes, and the PNR entry draws no
// outline around its cells.

test("a page switch lands at the top without animating the scroll", async ({ page, isMobile }) => {
  test.skip(isMobile, "the desktop masthead link is the trigger");
  await gotoReady(page, "/privacy");
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    const w = window as unknown as { __scroll: number[] };
    w.__scroll = [];
    const tick = () => {
      w.__scroll.push(Math.round(window.scrollY));
      if (w.__scroll.length < 90) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByRole("banner").getByRole("link", { name: "Accuracy", exact: true }).click();
  await page.waitForURL("**/accuracy");
  await page.waitForTimeout(1600);
  const scroll = await page.evaluate(() => (window as unknown as { __scroll: number[] }).__scroll);
  const between = scroll.filter((y, i) => i > 0 && y > 0 && y < scroll[0]! && y !== scroll[i - 1]);
  expect(scroll.at(-1)).toBe(0);
  expect(between, `intermediate scroll frames: ${between.join(", ")}`).toEqual([]);
});

test("in-page anchors still glide", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop viewport keeps the anchor far enough away to sample");
  await gotoReady(page, "/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-scroll-behavior", "smooth");
  expect(await html.evaluate((el) => getComputedStyle(el).scrollBehavior)).toBe("smooth");
});

test("the theme button eases back from its press while the theme changes", async ({ page }) => {
  await gotoReady(page, "/watchlist");
  const button = page.getByRole("banner").getByRole("button", { name: /^Theme:/ });
  // On a phone the button sits in the sideways-scrolling nav strip; bring it into view first.
  await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const w = window as unknown as { __scale: number[] };
    w.__scale = [];
    const tick = () => {
      const el = document.querySelector('header button[aria-label^="Theme"]');
      const t = el ? getComputedStyle(el).transform : "none";
      w.__scale.push(t === "none" ? 1 : Number.parseFloat(t.slice(7)));
      if (w.__scale.length < 40) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.mouse.up();
  await page.waitForTimeout(900);
  await expect(page.locator("html")).toHaveAttribute("data-theme", /light|dark/);
  const scale = await page.evaluate(() => (window as unknown as { __scale: number[] }).__scale);
  const easing = scale.filter((s) => s > 0.965 && s < 0.995);
  expect(easing.length, `release frames: ${scale.map((s) => s.toFixed(3)).join(" ")}`).toBeGreaterThanOrEqual(2);
  expect(scale.at(-1)).toBeCloseTo(1, 2);
});

test("the PNR entry draws no outline around its cells", async ({ page }) => {
  await gotoReady(page, "/");
  await enterPnr(page, "3213123");
  const cells = page.getByTestId("hero-instrument").locator("[data-cell]").first().locator("xpath=../../..");
  const outline = await cells.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).toBe("none");
});

test("focusing a masthead control while scrolled down never moves the page", async ({ page, isMobile }) => {
  // Keyboard focus, and the focus Next moves during navigation, used to make the browser smooth-scroll
  // to "reveal" controls under the old scroll-padding on <html>: a lurch on press and on page switch.
  await gotoReady(page, "/privacy");
  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  await page.waitForTimeout(200);
  const start = await page.evaluate(() => Math.round(window.scrollY));
  expect(start).toBeGreaterThan(0);
  const banner = page.getByRole("banner");
  const navControl = isMobile ? banner.getByRole("button", { name: "Open menu" }) : banner.getByRole("link", { name: "Accuracy", exact: true });
  for (const target of [navControl, banner.getByRole("button", { name: /^Theme:/ }), banner.getByTestId("sign-in")]) {
    await target.evaluate((el) => (el as HTMLElement).focus());
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(start);
  }
});
