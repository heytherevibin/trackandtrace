import { expect, test } from "@playwright/test";
import { PNR } from "../helpers";
import { motionOff, waitForJourney } from "./journey-helpers";

test.describe("the hero dial", () => {
  test.skip(({ isMobile }) => isMobile, "the dial draws from 64rem");

  test("lights one segment per digit, and clears with the plate", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
    const input = page.getByTestId("hero-instrument").getByRole("textbox");
    await input.pressSequentially("2345");
    await expect(page.locator(".hero-dial .dial-seg.is-on")).toHaveCount(4);
    await input.fill("");
    await expect(page.locator(".hero-dial .dial-seg.is-on")).toHaveCount(0);
  });

  test("turns into a 24-hour face after a result, with the record's own chart time", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-17T06:30:00.000Z"));
    await page.goto("/");
    await waitForJourney(page);
    const plate = page.getByTestId("hero-instrument");
    await plate.getByRole("textbox").fill(PNR.cnf);
    await plate.getByRole("button", { name: /run/i }).click();
    await expect(page.getByTestId("terminal-result")).toBeVisible();
    await expect(page.locator(".hero-dial")).toHaveClass(/is-face/);
    await expect(page.locator(".dial-readout")).toHaveText(/^Chart \d{2}:\d{2} IST · in \d+ h \d+ min$/i);
    await expect(page.locator(".dial-arc")).toHaveAttribute("d", /^M/);
  });

  test("Motion off: the face is drawn at once", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    const plate = page.getByTestId("hero-instrument");
    await plate.getByRole("textbox").fill(PNR.cnf);
    await plate.getByRole("button", { name: /run/i }).click();
    await expect(page.locator(".hero-dial")).toHaveClass(/is-face/);
    expect(await page.locator(".dial-face").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  });

  test("a check picked from the recent list takes the face away", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-17T06:30:00.000Z"));
    await page.goto("/");
    await waitForJourney(page);
    const plate = page.getByTestId("hero-instrument");
    await plate.getByRole("textbox").fill(PNR.cnf);
    await plate.getByRole("button", { name: /run/i }).click();
    await expect(page.locator(".hero-dial")).toHaveClass(/is-face/);

    await plate.getByRole("button", { name: "Check another PNR" }).click();
    await plate.getByRole("textbox").fill(PNR.rac);
    await plate.getByRole("button", { name: /run/i }).click();
    await expect(page.locator(".hero-dial")).toHaveClass(/is-face/);

    await plate.getByTestId("recent-item").filter({ hasText: "234 567 8901" }).click();
    await expect(page.locator(".hero-dial")).not.toHaveClass(/is-face/);
    await expect(page.locator(".dial-readout")).toHaveText("");
    await expect(page.locator(".dial-chart-mark")).toHaveAttribute("cx", "0");
    await expect(page.locator(".dial-chart-mark")).toHaveAttribute("cy", "-352");
  });
});
