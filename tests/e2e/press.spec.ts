import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { enterPnr, gotoReady } from "./helpers";

/** The nav control at this width: the tab bar's Menu on a phone, a masthead nav key on desktop (Neubrutal v4). */
function mastheadNavControl(page: Page, isMobile: boolean): Locator {
  return isMobile
    ? page.getByRole("navigation", { name: "Sections" }).getByRole("button", { name: "Menu" })
    : page.getByRole("banner").getByRole("link", { name: "Watchlist", exact: true });
}

// Every button in the app answers a press and springs back on release, as a transform only, so nothing around it
// moves (stable) and it eases in and out (smooth). Two presses: a key with v4's hard shadow presses into it (translate
// 3px, 3px: .nb-press); anything else settles inward (scale, motion.css).

interface Pressed {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

async function transformOf(target: Locator): Promise<Pressed> {
  return target.evaluate((el) => {
    const t = getComputedStyle(el).transform;
    const m = t.match(/matrix\(([^)]+)\)/);
    if (!m) return { scale: 1, x: 0, y: 0 };
    const [a, , , , e, f] = m[1]!.split(",").map((v) => Number.parseFloat(v));
    return { scale: a ?? 1, x: e ?? 0, y: f ?? 0 };
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
  const pressed = await transformOf(target);
  const layoutPressed = await target.evaluate((el) => ({ x: (el as HTMLElement).offsetLeft, y: (el as HTMLElement).offsetTop, w: (el as HTMLElement).offsetWidth, h: (el as HTMLElement).offsetHeight }));
  // Release away from the target so the press does not trigger navigation or state changes.
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await page.waitForTimeout(350);
  const released = await transformOf(target);

  const intoShadow = Math.abs(pressed.x - 3) < 0.5 && Math.abs(pressed.y - 3) < 0.5;
  const inward = pressed.scale < 0.99 && pressed.scale > 0.9;
  expect(intoShadow || inward, `${label} presses: into its shadow, or settling slightly (${JSON.stringify(pressed)})`).toBe(true);
  expect(layoutPressed, `${label} keeps its layout box`).toEqual(layoutBefore);
  expect(released.scale, `${label} springs back`).toBeCloseTo(1, 2);
  expect(Math.abs(released.x) + Math.abs(released.y), `${label} comes back out of its shadow`).toBeLessThan(0.5);
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
  await gotoReady(page, "/pnr#2345678901");
  await expectPressAnimates(page, page.getByTestId("refresh"), "refresh");
  await expectPressAnimates(page, page.getByTestId("save-watchlist"), "save");
});
