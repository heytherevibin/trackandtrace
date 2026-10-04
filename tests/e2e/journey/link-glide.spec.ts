import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { REBUILD_EVENT } from "@/components/landing/journey/journey-events";
import { atRest, atTheWindow, dismissInstall, drawStill, frames, from07, noAnchoring, running, stationOf, waitForJourney } from "./journey-helpers";
import { atResize, glidePlace, midGlide, tellThroughGlide, throughGlide, watchResize } from "./link-glide-helpers";

// A tapped link's glide, cut short (the reviewer, 2026-10-01: 15 and 13 runs in 36 on the nightly's webkit-phone, to 07).
// A phone's toolbar resizes the window a few frames into the glide; the browser set the glide's end as it began, and every
// piece above the target that is sized by the window (the still's columns, 02's 330vh, the run's own pin) moved it from
// under that end, some with a place-keeping jump that cancels the glide outright. Taken up as a Tab's is, and never
// against the reader. To 07 (the run brings its station to the window: run.ts) and to 08, below the run (the browser's own
// glide to a fragment: focus-glide.ts).
test.describe("a tapped in-page link's glide (spec §3.G)", () => {
  const sizes = (isMobile: boolean) => (isMobile ? { tall: { width: 390, height: 844 }, short: { width: 390, height: 764 } } : { tall: { width: 1440, height: 900 }, short: { width: 1440, height: 820 } });
  /** The board's rows have flipped in (their entrance, once a load): a tap while a name's letters are still being
   * replaced can land on a letter that is gone by the click and go nowhere. (2 taps in 1,720 on the nightly's WebKit left
   * the address as it was; this is the likeliest cause, not a proven one.) */
  const boardAtRest = (page: Page) => expect.poll(() => page.locator("#departures .board-name .flap-char").count(), { timeout: 6_000 }).toBe(0);
  /** Taps (a touch screen) or clicks the board's link named `name`, as the reader would: where the page stood. */
  const tapLink = async (page: Page, isMobile: boolean, name: string): Promise<number> => {
    const link = page.locator(".board").getByRole("link", { name });
    await link.scrollIntoViewIfNeeded();
    await atRest(page);
    await boardAtRest(page);
    const start = await page.evaluate(() => window.scrollY);
    if (isMobile) await link.tap();
    else await link.click();
    return start;
  };
  /** How far a section's top stands from where a link to it lands it (its scroll margin below the window's top). */
  const fromLanding = (page: Page, id: string) =>
    page.evaluate((target) => {
      const el = document.getElementById(target);
      if (!el) throw new Error(`#${target} is missing`);
      return Math.abs(Math.round(el.getBoundingClientRect().top - (Number.parseFloat(getComputedStyle(el).scrollMarginTop) || 0)));
    }, id);
  /** The least a reader must still be from the target as a test acts, for it to have acted mid-glide: more than every
   * piece above the target moves it by at these sizes (424 px: 02's 264, the still's 80 and the run's 80). */
  const FAR = 500;
  const MID_GLIDE = "the precondition: the reader was still far from the target as the test acted, the glide not over";
  const LINKS = [
    { code: "07", id: "use", name: "Where it gets used" },
    { code: "08", id: "faq", name: "Questions" },
  ] as const;

  for (const { code, id, name } of LINKS)
    for (const anchoring of ["on", "off"] as const)
      for (const toolbar of ["hides", "shows"] as const)
        // two frames in (in Chromium, before the glide has moved the page), and 15% of the way through it: by place, not
        // a count of frames ("eight frames in" was at WebKit's glide's end, the reader 0 to 195 px from the target)
        for (const when of ["2 frames into the glide", "15% of the way through the glide"] as const) {
          test(`reaches ${code} though the toolbar ${toolbar} ${when} (scroll anchoring ${anchoring})`, async ({ page, isMobile }) => {
            test.setTimeout(60_000); // the rest wait's own limit (REST_MS), and the page's loads
            const { tall, short } = sizes(isMobile);
            const [from, to] = toolbar === "hides" ? [short, tall] : [tall, short];
            const at = await midGlide(FAR, async () => {
              await drawStill(page);
              await page.setViewportSize(from);
              if (anchoring === "off") await noAnchoring(page);
              await page.goto("/");
              await waitForJourney(page);
              await dismissInstall(page);
              await running(page);
              const start = await tapLink(page, isMobile, name);
              await expect(page).toHaveURL(new RegExp(`#${id}$`));
              await watchResize(page, id);
              if (when === "2 frames into the glide") await frames(page, 2);
              else await throughGlide(page, id, start, 0.15);
              await page.setViewportSize(to);
              await atRest(page, 15);
              await frames(page, 30); // the journey's own resize answer lands 150 ms later
              await atRest(page, 15);
              return atResize(page);
            });
            await running(page);
            expect(at.left, MID_GLIDE).toBeGreaterThan(FAR);
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
    await boardAtRest(page);
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
  // them, never carried on to the target. The glide is known from a reader's own move by how it goes: on toward its end,
  // never back, never stopping short of it; and nothing is taken up while that is in doubt.
  // Each drag as the page's place frame by frame (`start`: where the page stood at the tap). The last three stop as the
  // cut lands, or never look unlike a glide while they move
  // (the re-review, 2026-10-02: taken up on the second still frame, while the doubt still stood, each was carried to 07).
  const DRAGS: Readonly<Record<string, (start: number) => readonly number[]>> = {
    "on toward the target, six frames": (start) => [0, 1, 2, 3, 4, 5].map((i) => start + 400 + i * 7),
    "back up the page, six frames": (start) => [0, 1, 2, 3, 4, 5].map((i) => start + 600 - i * 7),
    "to a standstill, six frames": (start) => [0, 1, 2, 3, 4, 5].map(() => start + 400),
    "one frame before the resize": (start) => [start + 400],
    "two frames before the resize": (start) => [start + 400, start + 400],
    // held five frames: a hand held fewer before the resize's place-keeping jump is carried (the stated bound). From
    // near where the glide began, not from where it had got to: WebKit's is most of the way to the target by then.
    "steadily on toward the target, 30 px a frame for twelve frames": (start) => [...Array.from({ length: 12 }, (_, i) => start + 400 + 30 * (i + 1)), ...Array.from({ length: 5 }, () => start + 760)],
  };
  for (const { code, id, name } of LINKS)
    for (const [how, places] of Object.entries(DRAGS))
      test(`never carries a reader who dragged the scrollbar ${how}, then held it, on to ${code}`, async ({ page, isMobile }) => {
        const start = await openAndTap(page, isMobile, name);
        await frames(page, 3);
        for (const y of places(start)) {
          await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
          await frames(page, 1);
        }
        const left = await page.evaluate(() => Math.round(window.scrollY));
        expect((await glidePlace(page, id)).left, MID_GLIDE).toBeGreaterThan(1500);
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
    // the run unpinned and pinned again under the glide. Told in the page, a tenth of the way through the glide.
    test(`reaches ${code} though the journey rebuilds a tenth of the way through the glide`, async ({ page, isMobile }) => {
      test.setTimeout(60_000); // the rest wait's own limit (REST_MS), and the page's loads
      const start = await openAndTap(page, isMobile, name);
      const at = await tellThroughGlide(page, id, start, 0.1, REBUILD_EVENT);
      expect(at.left, MID_GLIDE).toBeGreaterThan(FAR);
      await settled(page);
      await running(page);
      if (id === "use") await atTheWindow(page, await stationOf(page, "#use *"));
      expect(await fromTarget(page, id)).toBeLessThanOrEqual(4);
    });
  }

  // Which rule each of these guards. Back fires popstate, on which both watches let go (and in WebKit the browser's own
  // scroll back is no glide's move, so the follower lets go too): the two tests above hold those. The address rule itself
  // (nothing is taken up while the address names something else) is held alone here: the address is replaced under the
  // glide with no popstate and no scroll, so only that rule stands between the resize's cut and a take-up.
  for (const { code, name } of LINKS)
    test(`takes nothing up to ${code} once the address names it no more, with no Back to say so`, async ({ page, isMobile }) => {
      await openAndTap(page, isMobile, name);
      await frames(page, 4);
      await countGlides(page);
      await page.evaluate(() => window.history.replaceState(null, "", window.location.pathname));
      await page.setViewportSize(sizes(isMobile).short);
      await settled(page);
      expect(await glidesMade(page), "glides the page started once the address had moved on").toBe(0);
    });

  // A link that glides nowhere: its own handler prevents the default and does nothing, the address naming its target
  // already. The click is watched all the same (the router's links prevent it too), but nothing is taken up for it until
  // the page has moved toward the target: a resize five frames on leaves the reader where they are (the re-review:
  // carried to 08 on all four projects).
  test("never takes a reader to 08 for a click that glided nowhere", async ({ page, isMobile }) => {
    await drawStill(page);
    await page.setViewportSize(sizes(isMobile).tall);
    await page.goto("/");
    await waitForJourney(page);
    await dismissInstall(page);
    await running(page);
    await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
    await atRest(page);
    await page.evaluate(() => {
      window.history.replaceState(null, "", "#faq");
      const link = document.createElement("a");
      link.href = "#faq";
      link.textContent = "nowhere";
      link.addEventListener("click", (event) => event.preventDefault());
      document.querySelector("main")?.prepend(link);
      link.click();
    });
    await frames(page, 5);
    const left = await page.evaluate(() => Math.round(window.scrollY));
    await page.setViewportSize(sizes(isMobile).short);
    await settled(page);
    const y = await page.evaluate(() => Math.round(window.scrollY));
    expect(Math.abs(y - left), `the reader stood at ${left}, and stands at ${y}`).toBeLessThanOrEqual(400);
    expect(await fromLanding(page, "faq")).toBeGreaterThan(1000);
  });

  // The rebuild lands once the glide is inside the run: the unpin sends that reader to the run's start (a change of
  // shape), and the run, its reader no longer above it, does not pin again until they are. The glide handed through the
  // rebuild found no pinned run to aim at and was dropped, the reader left 1,912 px short of 07 on the nightly's desktop
  // WebKit, whose glide is there four frames in (7 runs in 30; the re-review, 2026-10-02). Forced here in every engine.
  test("reaches 07 though the journey rebuilds as the glide passes through the run", async ({ page, isMobile }) => {
    test.setTimeout(60_000); // the rest wait's own limit (REST_MS), and the page's loads
    await openAndTap(page, isMobile, "Where it gets used");
    await page.evaluate(
      (rebuild) =>
        new Promise<void>((done) => {
          const tick = () => {
            const top = document.getElementById("run")?.getBoundingClientRect().top ?? 0;
            if (top > -200) return void requestAnimationFrame(tick);
            window.dispatchEvent(new Event(rebuild));
            done();
          };
          requestAnimationFrame(tick);
        }),
      REBUILD_EVENT,
    );
    await settled(page);
    await running(page);
    await atTheWindow(page, await stationOf(page, "#use *"));
    expect(await from07(page)).toBeLessThanOrEqual(4);
  });

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

  // Late in the glide (the re-review, 2026-10-03). Every test above resizes two or eight frames in, while the page still
  // stands above every piece that keeps its place. Later, the reader is passing through one: the resize holds the glide
  // still for a frame, and that piece's place-keeping jump lands on the doubt it raised. Settled for the reader, it let
  // the glide go, 1,291 to 7,856 px short of 07 or 08 and 360 px into the masthead's glide, 24 runs in 24 in Chromium.
  //
  // By place, not by frames (PR #116's first CI run): Chromium's glide runs on time, so on a slow machine "frame 40" is
  // near its end, where these measured a page already at rest. Each acts once the glide has covered a share of its way
  // (30%, 50% and 80%: through 02, and into the run), and fails on its own preconditions: that the reader was still
  // far from the target as the resize was told, and that a place-keeping jump did land mid-glide. The Critical itself
  // needs a still frame seen before that jump, which a slow machine does not give it (at bd19d27 the jump found a doubt
  // standing in 16 runs of 17 at 1x CPU, 1 of 17 at 4x, none at 8x); with every such jump made to drop the glide, 15 or
  // 16 of these 18 fail at 1x, 4x and 8x alike, so they measure the jump on a slow machine too.
  // WebKit's glide is ten frames long, and the resize is told a frame or two after it is asked for (more on a loaded
  // machine), so its shares are 20% and 35%: asked for at 45% or 60%, the glide was over as the resize was told now and
  // then, and the test said so.
  const SHARES = (browser: string) => (browser === "webkit" ? [0.2, 0.35] : [0.3, 0.5, 0.8]);
  /** The same for the masthead's link, whose glide in WebKit is shorter still: asked for at 30%, it was over as the resize
   * was told in 1 run of 10. */
  const TERMINAL_SHARES = (browser: string) => (browser === "webkit" ? [0.1, 0.2] : [0.3, 0.5, 0.8]);
  /** The masthead's link clicked, and the window resized once its glide has covered `share` of its way, mid-glide: where
   * the glide stood as the resize was told. */
  const terminalResized = (page: Page, isMobile: boolean, share: number, slow = false) =>
    midGlide(FAR, async () => {
      const start = await clickTerminal(page, isMobile, slow);
      await watchResize(page, "terminal");
      await throughGlide(page, "terminal", start, share);
      await page.setViewportSize(sizes(isMobile).short);
      await settled(page);
      return atResize(page);
    });
  /** The masthead's link to the terminal, clicked from 6,000 px down: where the page stood. `slow`: the router's
   * navigation takes 700 ms longer to go through, as on a slow machine (its change of the address, and its glide to the
   * fragment, each put off that long). In time, as the watch's wait for it is: sixty frames was past that wait's two
   * seconds at 8x CPU on a phone, 3 runs in 10. */
  const clickTerminal = async (page: Page, isMobile: boolean, slow = false): Promise<number> => {
    await drawStill(page);
    await page.setViewportSize(sizes(isMobile).tall);
    await page.goto("/");
    await waitForJourney(page);
    await dismissInstall(page);
    await running(page);
    await page.evaluate(() => window.scrollTo({ top: 6000, behavior: "instant" }));
    await atRest(page);
    const start = await page.evaluate(() => window.scrollY);
    if (slow)
      await page.evaluate(() => {
        const later = (act: () => void) => void window.setTimeout(act, 700);
        for (const name of ["pushState", "replaceState"] as const) {
          const real = window.history[name].bind(window.history);
          window.history[name] = (...args) => later(() => real(...args));
        }
        // the router's own glide to the fragment, once: the page's later glides (a take-up) are not the router's
        const into = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (...args) {
          if (this.id !== "terminal") return into.apply(this, args);
          Element.prototype.scrollIntoView = into;
          later(() => into.apply(this, args));
        };
      });
    await page.evaluate(() => {
      const link = document.querySelector<HTMLAnchorElement>('header a[href="#terminal"]');
      if (!link) throw new Error("the masthead has no link to #terminal");
      link.click();
    });
    return start;
  };
  for (const share of [0.1, 0.2, 0.3, 0.35, 0.5, 0.8]) {
    for (const { code, id, name } of LINKS)
      test(`reaches ${code} though the window is resized ${share * 100}% of the way through the glide`, async ({ page, isMobile, browserName }) => {
        test.skip(!SHARES(browserName).includes(share), "another share of this engine's glide");
        test.setTimeout(60_000); // the rest wait's own limit (REST_MS), and the page's loads
        const at = await midGlide(FAR, async () => {
          const start = await openAndTap(page, isMobile, name);
          await watchResize(page, id);
          await throughGlide(page, id, start, share);
          await page.setViewportSize(sizes(isMobile).short);
          await settled(page);
          return atResize(page);
        });
        expect(at.left, MID_GLIDE).toBeGreaterThan(FAR);
        // and the case itself came about: a piece the reader was passing through kept their place with a jump, mid-glide.
        // Held to in Chromium, whose long glide is in a piece at each share; WebKit's ten-frame glide is between two as
        // the resize is told now and then (the jump landed in 139 runs of 140), so it is not asked there.
        if (browserName !== "webkit") expect(at.jumps, "the precondition: a place-keeping jump landed mid-glide").toBeGreaterThan(0);
        await running(page);
        if (id === "use") await atTheWindow(page, await stationOf(page, "#use *"));
        expect(await fromTarget(page, id)).toBeLessThanOrEqual(4);
      });
    test(`reaches the terminal by the masthead's link from 6,000 px down though the window is resized ${share * 100}% of the way through the glide`, async ({ page, isMobile, browserName }) => {
      test.skip(!TERMINAL_SHARES(browserName).includes(share), "another share of this engine's glide");
      test.setTimeout(60_000); // a run made again, when its resize came late
      expect((await terminalResized(page, isMobile, share)).left, MID_GLIDE).toBeGreaterThan(FAR);
      expect(await fromLanding(page, "terminal"), "the terminal's top where its link lands it").toBeLessThanOrEqual(4);
    });
  }
  // As it begins: the router glides a few frames after the click, and the resize lands before the page has moved far.
  test("reaches the terminal by the masthead's link from 6,000 px down though the window is resized as the glide begins", async ({ page, isMobile }) => {
    test.setTimeout(60_000); // a run made again, when its resize came late
    expect((await terminalResized(page, isMobile, 0.01)).left, MID_GLIDE).toBeGreaterThan(FAR);
    expect(await fromLanding(page, "terminal"), "the terminal's top where its link lands it").toBeLessThanOrEqual(4);
  });

  // The router's navigation on a slow machine: the address names the terminal, and the glide begins, 700 ms after the
  // click, past the thirty frames a glide is given to begin. Counted from the click, the watch had let go by then, and
  // the glide that came after was left 3,700 to 5,500 px short at the resize (5 runs in 2,195 at 4x CPU; forced here).
  test("reaches the terminal by the masthead's link though the router takes 700 ms to go there", async ({ page, isMobile, browserName }) => {
    test.setTimeout(60_000); // a run made again, when its resize came late
    expect((await terminalResized(page, isMobile, TERMINAL_SHARES(browserName)[0] ?? 0.3, true)).left, MID_GLIDE).toBeGreaterThan(FAR);
    expect(await fromLanding(page, "terminal"), "the terminal's top where its link lands it").toBeLessThanOrEqual(4);
  });

  // And a hand late in the glide: 30% of the way through it (passing through 02, which keeps its place) the bar is
  // dragged on a little and held for six frames, then the window is resized. Held five frames or more, the hand is known
  // before the jump. Not carried means no glide was begun for them: what does move them is place-keeping, an instant
  // jump by what the pieces above them changed by (at most 424 px at these sizes), never a glide.
  for (const { code, id, name } of LINKS)
    test(`never carries a reader who dragged the scrollbar late in the glide, then held it, on to ${code}`, async ({ page, isMobile }) => {
      const start = await openAndTap(page, isMobile, name);
      const { y: y0 } = await throughGlide(page, id, start, 0.3);
      for (let i = 0; i < 6; i += 1) {
        await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y0 + 200);
        await frames(page, 1);
      }
      const held = await glidePlace(page, id);
      expect(held.left, MID_GLIDE).toBeGreaterThan(1500);
      await countGlides(page);
      await page.setViewportSize(sizes(isMobile).short);
      await settled(page);
      const y = await page.evaluate(() => Math.round(window.scrollY));
      expect(await glidesMade(page), `glides the page started for a reader who held it at ${held.y}, and stands at ${y}`).toBe(0);
      expect(Math.abs(y - held.y), `the reader left the page at ${held.y}, and stands at ${y}: more than place-keeping moves anyone`).toBeLessThanOrEqual(424 + 4);
      expect(await fromTarget(page, id), `${code} is nowhere near: the reader at ${y}`).toBeGreaterThan(1000);
    });
});
