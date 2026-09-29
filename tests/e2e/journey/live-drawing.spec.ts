import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { SCENE_CHUNK_MARK } from "@/components/landing/journey/scene/scene-mark";
import { collisionsInView } from "./collisions";
import { drawingCollisions } from "./drawing-checks";
import { dismissInstall, frames, scrollIntoChapter, scrollToId, skipWithoutWebgl2, waitForJourney, waitForLive } from "./journey-helpers";

// Every test here needs the live drawing: in a WebKit with no WebGL 2 (J6-12) each skips before it starts, saying so,
// by the same check waitForLive makes.
test.beforeEach(async ({ page }) => skipWithoutWebgl2(page));

test.describe("the train, drawn live (spec §3.A, §3.C)", () => {
  test("loads its scene, pins the chapter and draws into its stage", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "");
    await expect(page.locator("#journey-canvas")).toBeVisible();
    await scrollIntoChapter(page, 0.4);
    await expect.poll(() => page.evaluate(() => window.__ttJourney?.inked("#anatomy .anatomy-stage") ?? 0)).toBeGreaterThan(0.002);
  });

  test("its progress never steps back while scrolling down (§3.H)", async ({ page }) => {
    test.setTimeout(120_000); // 40 steps, each waiting on frames a software GPU under a parallel run draws slowly
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0);
    const seen: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      // 180px down, as a wheel's notch scrolls it: by the page's own scroll, which every browser and device takes
      // (Playwright's wheel is not supported in mobile WebKit)
      await page.evaluate(() => window.scrollBy({ top: 180, behavior: "instant" }));
      await frames(page, 3); // the scroll has landed and the drawing has followed it a step
      seen.push(await page.evaluate(() => window.__ttJourney?.anatomy() ?? 0));
    }
    const back = seen.filter((p, i) => i > 0 && p < seen[i - 1]! - 1e-6);
    expect(back, seen.join(", ")).toEqual([]);
    expect(seen.at(-1)).toBeGreaterThan(0.5);
  });

  test("catches up with the page by itself after the main thread stalls past half a second (a slow phone's long frame)", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0.1);
    // one scroll on to 0.5, a couple of frames for the drawing to start following it, then a stall longer than the
    // 500 ms anime's scroll sync stays awake after a scroll event; no scroll event comes after it
    await page.evaluate(() => {
      const section = document.getElementById("anatomy")!;
      const pin = section.querySelector(".anatomy-pin")!;
      const stick = Number.parseFloat(getComputedStyle(pin).top) || 0;
      const start = section.getBoundingClientRect().top + window.scrollY - stick;
      window.scrollTo({ top: start + (section.offsetHeight - window.innerHeight + stick) * 0.5, behavior: "instant" });
    });
    await frames(page, 2);
    await page.evaluate(() => {
      const end = performance.now() + 800;
      while (performance.now() < end) {
        // the main thread is held, as a long frame holds it
      }
    });
    await expect.poll(() => page.evaluate(() => window.__ttJourney?.anatomy() ?? -1), { timeout: 15_000 }).toBeCloseTo(0.5, 2);
  });

  test("tells the horn once as the train pulls away on the way down, and not on the way back", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);
    await page.evaluate(() => {
      const w = window as unknown as { __departs: number };
      w.__departs = 0;
      window.addEventListener("tt:depart", () => (w.__departs += 1));
    });
    await scrollIntoChapter(page, 0.8);
    await scrollIntoChapter(page, 0.95);
    await scrollIntoChapter(page, 0.6);
    expect(await page.evaluate(() => (window as unknown as { __departs: number }).__departs)).toBe(1);
  });

  test("draws the arrived train at the terminus", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);
    await scrollToId(page, "terminus", 80);
    await expect.poll(() => page.evaluate(() => window.__ttJourney?.inked(".terminus-stage") ?? 0)).toBeGreaterThan(0.002);
  });

  test("draws Night from the theme's own tokens", async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("tt.theme", "dark"));
    await page.goto("/");
    await waitForLive(page);
    expect(await page.evaluate(() => window.__ttJourney?.night())).toBe(true);
  });

  test("forced colours: it still draws live, and the labels take the system's text colour (J5-21)", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Playwright emulates forced colours only in Chromium");
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0.4);
    await expect.poll(() => page.evaluate(() => window.__ttJourney?.inked("#anatomy .anatomy-stage") ?? 0)).toBeGreaterThan(0.002);
    const [label, system] = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.color = "CanvasText";
      document.body.append(probe);
      const read = [getComputedStyle(document.querySelector("#anatomy .callout-title")!).color, getComputedStyle(probe).color];
      probe.remove();
      return read;
    });
    expect(label).toBe(system);
  });
});

test.describe("the live labels (J5-5)", () => {
  test.skip(({ isMobile }) => isMobile, "the columns are a wide screen's");

  test("stand in columns, wiping in and rising, never fading, and stay the page's list", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0.05);
    const pin = page.locator("#anatomy .anatomy-pin");
    await expect(pin).toHaveAttribute("data-live", "columns");
    const labels = page.locator("#anatomy .callout");
    await expect(page.getByRole("list", { name: "What each part does" }).getByRole("listitem")).toHaveCount(10);
    expect(await labels.evaluateAll((els) => els.map((el) => getComputedStyle(el).clipPath))).not.toContain("none");
    await scrollIntoChapter(page, 0.4);
    const shown = await labels.evaluateAll((els) => els.map((el) => [getComputedStyle(el).opacity, getComputedStyle(el).clipPath]));
    expect(shown.every(([opacity, clip]) => opacity === "1" && clip === "none"), JSON.stringify(shown)).toBe(true);
    await expect(page.locator("#anatomy .live-lines line")).toHaveCount(10);
  });

  test("a label under a fine pointer lights its part, and the part lights its label", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0.4);
    const label = page.locator('#anatomy .callout[data-part="shell"]');
    await label.hover();
    await expect(label).toHaveClass(/is-hot/);
  });
});

const SIZES = [
  { name: "1440×900", viewport: { width: 1440, height: 900 } },
  { name: "390×844", viewport: { width: 390, height: 844 } },
  { name: "844×390, a phone on its side", viewport: { width: 844, height: 390 } },
] as const;

test.describe("nothing collides through the live chapter (spec §5)", () => {
  test.skip(({ isMobile }) => isMobile, "each size is set here");
  for (const size of SIZES) {
    test(`at ${size.name}`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize(size.viewport);
      await page.goto("/");
      await waitForLive(page);
      const found: string[] = [];
      for (let k = 0; k <= 20; k += 1) {
        await scrollIntoChapter(page, k / 20);
        await frames(page); // the labels, leaders and figures have been placed for this progress
        for (const f of [...(await collisionsInView(page)), ...(await drawingCollisions(page))]) found.push(`${k / 20}: ${f}`);
      }
      expect(found).toEqual([]);
    });
  }
});

/** Holds the scene chunk back until the returned function is called: the load window, kept open. */
async function holdSceneChunk(page: Page): Promise<() => void> {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/_next/static/**/*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes(SCENE_CHUNK_MARK)) await held;
    return route.fulfill({ response, body });
  });
  return release;
}

const mastheadFoot = (page: Page) => page.evaluate(() => document.querySelector("header")?.getBoundingClientRect().bottom ?? 0);
const topOf = (page: Page, id: string) => page.evaluate((target) => document.getElementById(target)?.getBoundingClientRect().top ?? Number.NaN, id);

test.describe("the live drawing at its edges", () => {
  test("while the scene loads, the chapter reads as its words and its list: no empty stage, nothing colliding", async ({ page }) => {
    const release = await holdSceneChunk(page);
    await page.goto("/");
    await waitForJourney(page);
    await dismissInstall(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "live");
    await scrollToId(page, "anatomy", 80);
    await frames(page);
    await expect(page.locator("#anatomy")).not.toHaveClass(/is-live/);
    await expect(page.locator("#anatomy .anatomy-still:not(.is-noscript)")).toBeHidden();
    await expect(page.locator("#anatomy .anatomy-stage")).toBeHidden();
    await expect(page.locator("#anatomy .anatomy-legend")).toBeVisible();
    expect([...(await collisionsInView(page)), ...(await drawingCollisions(page))]).toEqual([]);
    release();
    await waitForLive(page);
    await frames(page);
    expect([...(await collisionsInView(page)), ...(await drawingCollisions(page))]).toEqual([]);
    await page.unrouteAll({ behavior: "ignoreErrors" });
  });

  test("writes the nameboard in the page's own words", async ({ page }) => {
    await page.addInitScript(() => {
      const written: string[] = [];
      Reflect.set(window, "__written", written);
      const fill = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text: string, x: number, y: number, maxWidth?: number) {
        written.push(text);
        return maxWidth === undefined ? fill.call(this, text, x, y) : fill.call(this, text, x, y, maxWidth);
      };
    });
    await page.goto("/");
    await waitForLive(page);
    const written = await page.evaluate(() => Reflect.get(window, "__written") as string[]);
    expect(written).toEqual(expect.arrayContaining(["PLATFORM 3", "DEPARTURES"]));
  });

  test("draws only inside its stages: the chapter's, and the terminus's", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0.4);
    await expect.poll(() => page.evaluate(() => window.__ttJourney?.inked("#anatomy .anatomy-stage") ?? 0)).toBeGreaterThan(0.002);
    // the masthead's band sits above the pinned stage: the canvas under it stays empty
    expect(await page.evaluate(() => window.__ttJourney?.inked("header") ?? -1)).toBe(0);
    await scrollToId(page, "terminus", 80);
    await expect.poll(() => page.evaluate(() => window.__ttJourney?.inked(".terminus-stage") ?? 0)).toBeGreaterThan(0.002);
    expect(await page.evaluate(() => window.__ttJourney?.inked("#terminus > :last-child") ?? -1)).toBe(0);
  });

  test("a reader inside the chapter when it falls back to the still lands on its start, under the masthead", async ({ page }) => {
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0.5);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("tt:webgl", { detail: "lost" })));
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "webgl");
    await expect(page.locator("#anatomy")).not.toHaveClass(/is-live/);
    await frames(page);
    expect(Math.abs((await topOf(page, "anatomy")) - (await mastheadFoot(page)))).toBeLessThanOrEqual(1);
  });
});

test.describe("the live drawing and a fine pointer", () => {
  test.skip(({ isMobile }) => isMobile, "fine pointers only");

  test("each part under the pointer lights its own label", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0.4);
    // each leader ends on its part: a pointer resting there picks that part through the chapter's own camera
    const ends = await page.evaluate(() => {
      const pin = document.querySelector<HTMLElement>("#anatomy .anatomy-pin")!;
      const pr = pin.getBoundingClientRect();
      const parts = [...pin.querySelectorAll<HTMLElement>(".callout")].map((l) => l.dataset.part ?? "");
      return [...pin.querySelectorAll<SVGCircleElement>(".live-lines circle")].map((c, i) => ({ part: parts[i] ?? "", x: pr.left + Number(c.getAttribute("cx")), y: pr.top + Number(c.getAttribute("cy")) }));
    });
    expect(ends).toHaveLength(10);
    for (const end of ends) {
      await page.mouse.move(end.x, end.y);
      await expect(page.locator("#anatomy .callout.is-hot"), end.part).toHaveAttribute("data-part", end.part);
    }
  });

  test("takes back the label it lit when it stops, and leaves the still none to clear", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForLive(page);
    await scrollIntoChapter(page, 0.4);
    await page.locator('#anatomy .callout[data-part="roof"]').hover();
    await expect(page.locator('#anatomy .callout[data-part="roof"]')).toHaveClass(/is-hot/);
    // read in the same task as the stop, before the pointer (still resting on a label) can light anything for the still
    const lit = await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("tt:webgl", { detail: "lost" }));
      return [document.documentElement.dataset.drawing, document.querySelectorAll("#anatomy .is-hot, #anatomy [data-hot]").length];
    });
    expect(lit).toEqual(["still", 0]);
  });
});

test.describe("Back to the live page (J5-2)", () => {
  test.skip(({ isMobile }) => isMobile, "the masthead's links stand open on wide screens");

  const leaveAndReturn = async (page: Page) => {
    await page.getByLabel("Primary").getByRole("link", { name: "Watchlist" }).click();
    await expect(page).toHaveURL(/\/watchlist/);
    await page.goBack();
    await waitForJourney(page);
  };

  test("a return to a section below the chapter lands where the reader left, and nothing pins under them", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForLive(page);
    await scrollToId(page, "principles", 120);
    const before = await topOf(page, "principles");
    await leaveAndReturn(page);
    await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "place");
    await expect(page.locator("#anatomy")).not.toHaveClass(/is-live/);
    await expect.poll(() => topOf(page, "principles")).toBeCloseTo(before, -1);
    await frames(page, 4);
    expect(Math.abs((await topOf(page, "principles")) - before)).toBeLessThanOrEqual(4);
  });

  test("a return to a section above the chapter lands where the reader left, and the pin that follows leaves them there", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForLive(page);
    await scrollToId(page, "departures", 40);
    const before = await topOf(page, "departures");
    await leaveAndReturn(page);
    await waitForLive(page);
    await frames(page, 4);
    expect(Math.abs((await topOf(page, "departures")) - before)).toBeLessThanOrEqual(4);
  });
});
