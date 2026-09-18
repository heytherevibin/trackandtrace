import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { enterPnr, gotoReady } from "./helpers";

/** The masthead's nav control at this width: the hamburger on a phone, a nav box on desktop. */
function mastheadNavControl(page: Page, isMobile: boolean): Locator {
  const banner = page.getByRole("banner");
  return isMobile ? banner.getByRole("button", { name: "Open menu" }) : banner.getByRole("link", { name: "Watchlist", exact: true });
}

// Every button in the app settles inward while pressed and springs back on release. The press is a
// transform only, so nothing around the button moves (stable), and it eases in and out (smooth).

async function scaleOf(target: Locator): Promise<number> {
  return target.evaluate((el) => {
    const t = getComputedStyle(el).transform;
    if (t === "none") return 1;
    const m = t.match(/matrix\(([^,]+),/);
    return m ? Number.parseFloat(m[1]!) : 1;
  });
}

async function expectPressAnimates(page: Page, target: Locator, label: string): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  expect(box, label).not.toBeNull();
  const layoutBefore = await target.evaluate((el) => ({ x: (el as HTMLElement).offsetLeft, y: (el as HTMLElement).offsetTop, w: (el as HTMLElement).offsetWidth, h: (el as HTMLElement).offsetHeight }));
  const transition = await target.evaluate((el) => {
    const s = getComputedStyle(el);
    return { property: s.transitionProperty, duration: s.transitionDuration };
  });
  expect(transition.property, `${label} transitions transform`).toMatch(/transform|all/);

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(250);
  const pressed = await scaleOf(target);
  const layoutPressed = await target.evaluate((el) => ({ x: (el as HTMLElement).offsetLeft, y: (el as HTMLElement).offsetTop, w: (el as HTMLElement).offsetWidth, h: (el as HTMLElement).offsetHeight }));
  // Release away from the target so the press does not trigger navigation or state changes.
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.waitForTimeout(350);
  const released = await scaleOf(target);

  expect(pressed, `${label} settles while pressed`).toBeLessThan(0.99);
  expect(pressed, `${label} settles only slightly`).toBeGreaterThan(0.9);
  expect(layoutPressed, `${label} keeps its layout box`).toEqual(layoutBefore);
  expect(released, `${label} springs back`).toBeCloseTo(1, 2);
}

test("buttons on the landing press and release smoothly", async ({ page, isMobile }) => {
  await gotoReady(page, "/");
  const banner = page.getByRole("banner");
  await expectPressAnimates(page, mastheadNavControl(page, isMobile), "masthead nav control");
  await expectPressAnimates(page, banner.getByRole("button", { name: /^Theme:/ }), "theme button");
  await expectPressAnimates(page, banner.getByTestId("sign-in"), "sign in");
  const plate = page.getByTestId("hero-instrument");
  await enterPnr(page, "23456");
  await expectPressAnimates(page, plate.getByRole("button", { name: "Run", exact: true }), "run");
  await expectPressAnimates(page, plate.getByRole("button", { name: "Clear", exact: true }), "clear");
});

test("buttons on app pages press and release smoothly", async ({ page }) => {
  await gotoReady(page, "/watchlist");
  await expectPressAnimates(page, page.getByRole("main").getByRole("link", { name: "Sign in to sync" }), "secondary link button");
  await expectPressAnimates(page, page.getByRole("main").getByRole("link", { name: "Run a check" }), "primary link button");
  await gotoReady(page, "/pnr/2345678901");
  await expectPressAnimates(page, page.getByTestId("refresh"), "refresh");
  await expectPressAnimates(page, page.getByTestId("save-watchlist"), "save");
});
