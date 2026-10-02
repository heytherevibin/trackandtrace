import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { REBUILD_EVENT } from "@/components/landing/journey/journey-events";
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

  /** Opens the landing at its tall size, the run pinned, and taps the board's link named `name`: where the page stood. */
  const openAndTap = async (page: Page, isMobile: boolean, name: string): Promise<number> => {
    await drawStill(page);
    await page.setViewportSize(sizes(isMobile).tall);
    await page.goto("/");
    await waitForJourney(page);
    await dismissInstall(page);
    await running(page);
    const link = page.locator(".board").getByRole("link", { name });
    await link.scrollIntoViewIfNeeded();
    await atRest(page);
    const start = await page.evaluate(() => window.scrollY);
    if (isMobile) await link.tap();
    else await link.click();
    return start;
  };
  /** How far the page stands from the link's target: 07's first station at the window, 08 at its landing. */
  const fromTarget = (page: Page, id: string) => (id === "use" ? from07(page) : fromLanding(page, id));
  const settled = async (page: Page) => {
    await atRest(page, 15);
    await frames(page, 40); // the journey's own resize answer lands 150 ms later
    await atRest(page, 15);
  };

  // A scrollbar's drag sends the page no wheel, touch, key or pointer event: only the page moving, a frame at a time, as
  // set here. The reader took the page mid-glide, somewhere between its start and the link's target (so "between the two"
  // says nothing: the review, 2026-10-02), and a resize follows: they stay where they put it, as place-keeping leaves
  // them, never carried on to the target. The glide is known from a reader's own move by how it goes: on toward its end
  // every frame, never back, never stopping short, never slowing to a crawl far from it.
  const DRAGS = {
    "on toward the target": (start: number, i: number) => start + 400 + i * 7,
    "back up the page": (start: number, i: number) => start + 600 - i * 7,
    "to a standstill": (start: number) => start + 400,
  } as const;
  for (const { code, id, name } of LINKS)
    for (const [how, to] of Object.entries(DRAGS))
      test(`never carries a reader who dragged the scrollbar ${how} mid-glide on to ${code}`, async ({ page, isMobile }) => {
        const start = await openAndTap(page, isMobile, name);
        await frames(page, 3);
        // six frames of it, then the reader holds the page still (the bar still in hand), and the window is resized
        for (let i = 0; i < 6; i += 1) {
          await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), to(start, i));
          await frames(page, 1);
        }
        const left = await page.evaluate(() => Math.round(window.scrollY));
        await page.setViewportSize(sizes(isMobile).short);
        await settled(page);
        const y = await page.evaluate(() => Math.round(window.scrollY));
        // where they left it, but for what place-keeping moves a reader there by (the resize refits what stands above)
        expect(Math.abs(y - left), `the reader left the page at ${left}, and stands at ${y}`).toBeLessThanOrEqual(400);
        expect(await fromTarget(page, id), `${code} is nowhere near: the reader at ${y}`).toBeGreaterThan(1000);
      });

  // Back, or Back and Forward, mid-glide: the reader's own way through the history, and the browser's to scroll (WebKit
  // goes back to where the reader was; Chromium lets its glide run to the end it set). Nothing takes the glide up after
  // it, whatever the address then names: the journey starts no glide of its own (the review, 2026-10-02: the run took a
  // reader who had gone Back on to 07).
  /** Counts, from now, the glides the page itself starts: a smooth scrollTo, or a scrollIntoView. */
  const countGlides = (page: Page) =>
    page.evaluate(() => {
      const made = { n: 0 };
      Reflect.set(window, "__ttGlides", made);
      const scrollTo = window.scrollTo.bind(window);
      window.scrollTo = ((...args: [ScrollToOptions?] | [number, number]) => {
        const [first] = args;
        if (typeof first === "object" && first.behavior !== "instant") made.n += 1;
        return (scrollTo as (...a: unknown[]) => void)(...args);
      }) as typeof window.scrollTo;
      const into = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (...args) {
        made.n += 1;
        return into.apply(this, args);
      };
    });
  const glidesMade = (page: Page) => page.evaluate(() => (Reflect.get(window, "__ttGlides") as { n: number }).n);
  for (const { code, id, name } of LINKS) {
    for (const forward of [false, true])
      test(`takes nothing up to ${code} once the reader has gone Back${forward ? ", and Forward again" : ""} mid-glide`, async ({ page, isMobile }) => {
        await openAndTap(page, isMobile, name);
        await frames(page, 4);
        await countGlides(page);
        await page.evaluate(() => window.history.back());
        await frames(page, forward ? 2 : 3);
        if (forward) {
          await page.evaluate(() => window.history.forward());
          await frames(page, 2);
        }
        await page.setViewportSize(sizes(isMobile).short);
        await settled(page);
        expect(await page.evaluate(() => window.location.hash)).toBe(forward ? `#${id}` : "");
        expect(await glidesMade(page), "glides the page started after the reader went Back").toBe(0);
        if (!forward) expect(await fromTarget(page, id), `${code} is not where the page was taken`).toBeGreaterThan(100);
      });

    // The journey rebuilds mid-glide (a late font changing a piece's fit): every module is torn down and started again,
    // the run unpinned and pinned again under the glide.
    test(`reaches ${code} though the journey rebuilds four frames into the glide`, async ({ page, isMobile }) => {
      test.setTimeout(60_000); // the rest wait's own limit (REST_MS), and the page's loads
      await openAndTap(page, isMobile, name);
      await frames(page, 4);
      await page.evaluate((rebuild) => window.dispatchEvent(new Event(rebuild)), REBUILD_EVENT);
      await settled(page);
      await running(page);
      if (id === "use") await atTheWindow(page, await stationOf(page, "#use *"));
      expect(await fromTarget(page, id)).toBeLessThanOrEqual(4);
    });
  }

  // The masthead's link to the terminal is the router's own (a Next <Link>): its click arrives with its default prevented,
  // and the router glides to the fragment itself. Watched from the click all the same.
  test("reaches the terminal by the masthead's link though the window is resized four frames into the glide", async ({ page, isMobile }) => {
    await drawStill(page);
    await page.setViewportSize(sizes(isMobile).tall);
    await page.goto("/");
    await waitForJourney(page);
    await dismissInstall(page);
    await running(page);
    await page.evaluate(() => window.scrollTo({ top: 2500, behavior: "instant" }));
    await atRest(page);
    await page.evaluate(() => {
      const link = document.querySelector<HTMLAnchorElement>('header a[href="#terminal"]');
      if (!link) throw new Error("the masthead has no link to #terminal");
      link.click();
    });
    await frames(page, 4);
    await page.setViewportSize(sizes(isMobile).short);
    await settled(page);
    expect(await fromLanding(page, "terminal"), "the terminal's top where its link lands it").toBeLessThanOrEqual(4);
  });
});
