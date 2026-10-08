import { expect, test } from "../fixtures";
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

  // "At once" is read in the page, from the moment the dial takes the face's class and in every frame after it. Motion
  // off gives every property of every element a 0.01ms transition (motion.css), and an opacity's transition is the
  // compositor's to start: the face's opacity is still the old 0 as the class lands and for the few frames the
  // compositor takes (three or four on a quiet machine), then 1. This test once read it a single time, as soon as it
  // saw the class, and a reading taken inside those frames said "0": CI run 37755406293, and 1 run in 30 on main at 4x
  // CPU with three workers (Playwright's looks for the class fall due at 0.85 s and 1.85 s after the press, and a slow
  // runner brings the record about then). Read frame by frame instead: the face is never anywhere between 0 and 1 (a
  // fade, however short, is seen as one), it is at 1 within thirty frames (a face that waits is seen too), and it stays.
  test("Motion off: the face is drawn at once", async ({ page }) => {
    await motionOff(page);
    await page.goto("/");
    await waitForJourney(page);
    const plate = page.getByTestId("hero-instrument");
    await plate.getByRole("textbox").fill(PNR.cnf);
    const drawn = page.evaluate(
      () =>
        new Promise<string[]>((resolve) => {
          const dial = document.querySelector(".hero-dial");
          const face = document.querySelector(".dial-face");
          if (!dial || !face) throw new Error("the hero dial is missing");
          const seen: string[] = [];
          const watch = new MutationObserver(() => {
            if (!dial.classList.contains("is-face")) return;
            watch.disconnect();
            seen.push(getComputedStyle(face).opacity);
            const tick = () => {
              seen.push(getComputedStyle(face).opacity);
              // thirty frames to be drawn in, and the five after the first that is
              const drawnAt = seen.indexOf("1");
              if (drawnAt === -1 ? seen.length <= 30 : seen.length < drawnAt + 6) requestAnimationFrame(tick);
              else resolve(seen);
            };
            requestAnimationFrame(tick);
          });
          watch.observe(dial, { attributes: true, attributeFilter: ["class"] });
        }),
    );
    await plate.getByRole("button", { name: /run/i }).click();
    const opacity = await drawn;
    await expect(page.locator(".hero-dial")).toHaveClass(/is-face/);
    const read = `the face's opacity as the class landed and in each frame after: ${opacity.join(", ")}`;
    expect(opacity.filter((value) => value !== "0" && value !== "1"), `never between 0 and 1. ${read}`).toEqual([]);
    const drawnAt = opacity.indexOf("1");
    expect(drawnAt, `at 1 within thirty frames. ${read}`).toBeGreaterThanOrEqual(0);
    expect(opacity.slice(drawnAt), `and it stays. ${read}`).toEqual(opacity.slice(drawnAt).map(() => "1"));
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
