import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { atRest, atTheWindow, dismissInstall, drawStill, frames, from07, noAnchoring, running, stationOf, waitForJourney } from "./journey-helpers";

// A tapped link's glide, cut short (the reviewer, 2026-10-01: 15 and 13 runs in 36 on the nightly's webkit-phone, to 07).
// A phone's toolbar resizes the window a few frames into the glide; the browser set the glide's end as it began, and every
// piece above the target that is sized by the window (the still's columns, 02's 330vh, the run's own pin) moved it from
// under that end, some with a place-keeping jump that cancels the glide outright. Taken up as a Tab's is, and never
// against the reader. To 07 (the run brings its station to the window: run.ts) and to 08, below the run (the browser's own
// glide to a fragment: focus-glide.ts).
test.describe("a tapped in-page link's glide (spec §3.G)", () => {
  const sizes = (isMobile: boolean) => (isMobile ? { tall: { width: 390, height: 844 }, short: { width: 390, height: 764 } } : { tall: { width: 1440, height: 900 }, short: { width: 1440, height: 820 } });
  /** Taps (a touch screen) or clicks the board's link named `name`, as the reader would. */
  const tapLink = async (page: Page, isMobile: boolean, name: string) => {
    const link = page.locator(".board").getByRole("link", { name });
    await link.scrollIntoViewIfNeeded();
    await atRest(page);
    if (isMobile) await link.tap();
    else await link.click();
  };
  /** How far a section's top stands from where a link to it lands it (its scroll margin below the window's top). */
  const fromLanding = (page: Page, id: string) =>
    page.evaluate((target) => {
      const el = document.getElementById(target);
      if (!el) throw new Error(`#${target} is missing`);
      return Math.abs(Math.round(el.getBoundingClientRect().top - (Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0)));
    }, id);
  const LINKS = [
    { code: "07", id: "use", name: "Where it gets used" },
    { code: "08", id: "faq", name: "Questions" },
  ] as const;

  for (const { code, id, name } of LINKS)
    for (const anchoring of ["on", "off"] as const)
      for (const toolbar of ["hides", "shows"] as const)
        for (const at of [2, 8]) {
          test(`reaches ${code} though the toolbar ${toolbar} ${at} frames into the glide (scroll anchoring ${anchoring})`, async ({ page, isMobile }) => {
            test.setTimeout(60_000); // the rest wait's own limit (REST_MS), and the page's loads
            const { tall, short } = sizes(isMobile);
            const [from, to] = toolbar === "hides" ? [short, tall] : [tall, short];
            await drawStill(page);
            await page.setViewportSize(from);
            if (anchoring === "off") await noAnchoring(page);
            await page.goto("/");
            await waitForJourney(page);
            await dismissInstall(page);
            await running(page);
            await tapLink(page, isMobile, name);
            await expect(page).toHaveURL(new RegExp(`#${id}$`));
            await frames(page, at);
            await page.setViewportSize(to);
            await atRest(page, 15);
            await frames(page, 30); // the journey's own resize answer lands 150 ms later
            await atRest(page, 15);
            await running(page);
            if (id === "use") {
              await atTheWindow(page, await stationOf(page, "#use *"));
              expect(await from07(page), "07's top at the masthead's foot").toBeLessThanOrEqual(4);
            } else expect(await fromLanding(page, id), `${code}'s top where its link lands it`).toBeLessThanOrEqual(4);
          });
        }

  // The reader's own scroll during the glide is theirs: a finger on the page (or a wheel) lets go of it, and the resize
  // that follows never brings them back to the link's target.
  for (const { code, id, name } of LINKS)
    for (const anchoring of ["on", "off"] as const)
      test(`never pulls a reader who took the page mid-glide back to ${code} (scroll anchoring ${anchoring})`, async ({ page, isMobile }) => {
        const { tall, short } = sizes(isMobile);
        await drawStill(page);
        await page.setViewportSize(tall);
        if (anchoring === "off") await noAnchoring(page);
        await page.goto("/");
        await waitForJourney(page);
        await dismissInstall(page);
        await running(page);
        await tapLink(page, isMobile, name);
        await expect(page).toHaveURL(new RegExp(`#${id}$`));
        await frames(page, 2);
        // the reader's own: a finger moving on the page (a wheel on a desktop), and the scroll it makes, to 01
        await page.evaluate((touch) => {
          window.dispatchEvent(touch ? new Event("touchmove") : new WheelEvent("wheel", { deltaY: -100 }));
          const principles = document.getElementById("principles");
          if (!principles) throw new Error("#principles is missing");
          window.scrollTo({ top: principles.getBoundingClientRect().top + window.scrollY - 100, behavior: "instant" });
        }, isMobile);
        await frames(page, 4);
        await page.setViewportSize(short);
        await atRest(page, 15);
        await frames(page, 60);
        await atRest(page, 15);
        const top = await page.locator("#principles").evaluate((el) => el.getBoundingClientRect().top);
        // inside 01, where the reader put the page: the resize may refit what stands above it, never glide on to the link
        expect(Math.abs(top - 100), `01's top ${Math.round(top)}px down the window, where the reader put it`).toBeLessThanOrEqual(120);
      });
});
