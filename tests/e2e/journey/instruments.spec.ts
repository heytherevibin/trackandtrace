import { expect, test } from "../fixtures";
import { gotoReady } from "../helpers";
import { STATIONS } from "@/components/landing/journey/stations";
import { blockJourneyChunk } from "./journey-helpers";

// The journey's instruments, drawn still (spec 2026-09-24 §3.A, J2). Each test names the instrument it holds.

test.describe("the route", () => {
  test("every station on the route is a section of the landing", async ({ page }) => {
    await gotoReady(page, "/");
    for (const station of STATIONS) await expect(page.locator(`#${station.id}`), station.id).toHaveCount(1);
  });
});

// The owner rejected the route rail (#77) on 2026-09-27: nothing of it survives, on desktop or on a phone.
test.describe("no route strip", () => {
  test("leaves no #route-strip, no .phone-rail, and no [class*=\"strip-\"] element anywhere on the page", async ({ page }) => {
    await gotoReady(page, "/");
    await expect(page.locator("#route-strip")).toHaveCount(0);
    await expect(page.locator(".phone-rail")).toHaveCount(0);
    await expect(page.locator('[class*="strip-"]')).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Route through this page" })).toHaveCount(0);
  });

  test("#main carries no left inset from the rail, and spans the same width as on another page", async ({ page }) => {
    await gotoReady(page, "/");
    const landing = await page.locator("#main").evaluate((el) => ({ marginLeft: getComputedStyle(el).marginLeft, left: el.getBoundingClientRect().left, width: el.getBoundingClientRect().width }));
    expect(landing.marginLeft).toBe("0px");
    expect(landing.left).toBe(0);
    await gotoReady(page, "/watchlist");
    const other = await page.locator("#main").evaluate((el) => el.getBoundingClientRect().width);
    expect(landing.width).toBe(other);
  });

  test("the masthead is its plain 4rem row, nothing added", async ({ page }) => {
    await gotoReady(page, "/");
    const headerHeight = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--header-height").trim());
    expect(headerHeight).toBe("4rem");
    const measured = await page.locator("header").evaluate((h) => h.getBoundingClientRect().height);
    expect(measured).toBeLessThanOrEqual(65);
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
    if (isMobile) {
      await expect(dial).toBeHidden();
    } else {
      await expect(dial).toBeVisible();
      const measured = await page.evaluate(() => {
        const hero = document.querySelector("section[aria-labelledby='hero-title']")!;
        const dialEl = document.querySelector(".hero-dial")!;
        const plate = document.querySelector(".dial-host > :not(.hero-dial)")!;
        const departures = document.getElementById("departures")!;
        const heroStyle = getComputedStyle(hero);
        return {
          dialRight: dialEl.getBoundingClientRect().right,
          plateRight: plate.getBoundingClientRect().right,
          heroOverflowX: heroStyle.overflowX,
          heroOverflowY: heroStyle.overflowY,
          heroBottom: hero.getBoundingClientRect().bottom,
          departuresTop: departures.getBoundingClientRect().top,
        };
      });
      // The painted dial reaches past the plate's right edge, and the hero no longer cuts it there.
      expect(measured.dialRight).toBeGreaterThan(measured.plateRight);
      expect(measured.heroOverflowX).toBe("visible");
      // Nothing of the dial is painted over the board below.
      expect(measured.heroOverflowY).toBe("clip");
      expect(measured.heroBottom).toBeLessThanOrEqual(measured.departuresTop);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

test.describe("the berth plan", () => {
  test("lights the specimen passenger's berth beside the record, and says so in words", async ({ page }) => {
    await gotoReady(page, "/");
    const plan = page.locator("#record figure.berth-plan");
    await expect(plan).toBeVisible();
    // In view, so the reading holds whenever the journey starts: below the fold (a phone), a running journey
    // arms the plan unlit until it is seen, then draws it and lights the berth.
    await plan.scrollIntoViewIfNeeded();
    await expect(plan.locator(".plan-tag.is-lit")).toHaveText("12 LB");
    await expect(plan).toContainText("berth B1 · 12 LB, lit.");
  });
});

test.describe("the station clock", () => {
  test("shows the time in India beside Reliability's heading", async ({ page }) => {
    await gotoReady(page, "/");
    const clock = page.locator("#reliability").getByRole("img", { name: /^Station clock: \d{2}:\d{2} IST$/ });
    await expect(clock).toBeVisible();
    await expect(clock.locator(".clock-hand.is-minute")).toHaveAttribute("transform", /^rotate\(\d+(\.\d+)?\)$/);
  });
});

test.describe("the route map", () => {
  test("lays the roadmap's track above its rows on a wide screen, and steps aside on a phone", async ({ page, isMobile }) => {
    await gotoReady(page, "/");
    const map = page.locator("#roadmap .route-map");
    if (isMobile) await expect(map).toBeHidden();
    else await expect(map.locator(".route-stop")).toHaveCount(7);
  });
});

test.describe("the chapters instrument", () => {
  test("02 is a plain section until the journey pins it: three stops side by side, no instrument", async ({ page, isMobile }) => {
    await blockJourneyChunk(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-journey", "failed", { timeout: 15_000 });
    await expect(page.locator("#how .chapters-instrument")).toBeHidden();
    const tops = await page.locator("#how li[data-chapter]").evaluateAll((lis) => lis.map((li) => Math.round(li.getBoundingClientRect().top)));
    if (!isMobile) expect(new Set(tops).size).toBe(1);
  });
});
