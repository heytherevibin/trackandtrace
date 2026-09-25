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
