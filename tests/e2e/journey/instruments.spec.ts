import { expect, test } from "../fixtures";
import { gotoReady } from "../helpers";
import { STATIONS } from "../../../src/components/landing/journey/stations";

// The journey's instruments, drawn still (spec 2026-09-24 §3.A, J2). Each test names the instrument it holds.

test.describe("the route", () => {
  test("every station on the route is a section of the landing", async ({ page }) => {
    await gotoReady(page, "/");
    for (const station of STATIONS) await expect(page.locator(`#${station.id}`), station.id).toHaveCount(1);
  });
});

test.describe("the route strip", () => {
  test("sits in the landing's masthead, and its stops jump to their sections below the masthead", async ({ page, isMobile }) => {
    test.skip(isMobile, "on a phone the strip is a hairline rail without labels");
    await gotoReady(page, "/");
    const strip = page.getByRole("banner").getByRole("navigation", { name: "Route through this page" });
    await expect(strip).toBeVisible();
    await strip.getByRole("link", { name: "03 · The record you get" }).click();
    await expect(page).toHaveURL(/#record$/);
    const gap = await page.evaluate(() => document.getElementById("record")!.getBoundingClientRect().top - document.querySelector("header")!.getBoundingClientRect().bottom);
    expect(gap).toBeGreaterThanOrEqual(0);
    await gotoReady(page, "/watchlist");
    await expect(page.getByRole("navigation", { name: "Route through this page" })).toHaveCount(0);
  });

  test("on a phone, is a rail in the masthead's bottom edge with no labels", async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone layout");
    await gotoReady(page, "/");
    await expect(page.locator("#route-strip .strip-stops")).toBeHidden();
    await expect(page.locator("#route-strip .strip-train")).toBeVisible();
  });
});

test.describe("the departure board and the hero dial", () => {
  test("the board sits under the hero, and its destinations jump to their sections", async ({ page }) => {
    await gotoReady(page, "/");
    const board = page.getByRole("region", { name: "Departures · Platform 3" });
    await expect(board).toBeVisible();
    const heroBottom = await page.locator("section[aria-labelledby='hero-title']").evaluate((el) => el.getBoundingClientRect().bottom);
    expect((await board.boundingBox())!.y).toBeGreaterThanOrEqual(heroBottom - 1);
    await board.getByRole("link", { name: "Questions" }).click();
    await expect(page).toHaveURL(/#faq$/);
  });

  test("the dial stands behind the plate on a wide screen, hidden on a phone, and never scrolls the page", async ({ page, isMobile }) => {
    await gotoReady(page, "/");
    const dial = page.locator(".hero-dial");
    if (isMobile) await expect(dial).toBeHidden();
    else await expect(dial).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
