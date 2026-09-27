import { expect, type Locator, type Page } from "@playwright/test";
import { JOURNEY_CHUNK_MARK } from "@/components/landing/journey/journey-mark";
import { SCENE_CHUNK_MARK } from "@/components/landing/journey/scene/scene-mark";

/** The journey marks <html data-journey="on"> as it takes the page over, then starts its modules a turn at a time;
 * outside production it says when the last has started and the page has settled (window.__ttJourneyStarted), and
 * specs act only after that. A production build has no such probe (it is compiled out): there, drawing.ts's own
 * decision (data-drawing-why, written by the eleventh of fourteen modules) and two frames stand in for it. */
export async function waitForJourney(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-journey", "on", { timeout: 15_000 });
  if (await page.evaluate(() => "__ttJourneyStarted" in window)) {
    await page.waitForFunction(() => Reflect.get(window, "__ttJourneyStarted") === true, undefined, { timeout: 15_000 });
    return;
  }
  await expect(page.locator("html")).toHaveAttribute("data-drawing-why", /.*/, { timeout: 15_000 });
  await frames(page, 2);
}

/** Aborts the one script chunk that carries `mark`, found by its content, so its hashed name never matters. */
export async function blockChunk(page: Page, mark: string): Promise<void> {
  await page.route("**/_next/static/**/*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes(mark)) return route.abort();
    return route.fulfill({ response, body });
  });
}

/** Aborts the journey chunk. */
export const blockJourneyChunk = (page: Page): Promise<void> => blockChunk(page, JOURNEY_CHUNK_MARK);

/** The drawing is live and pinned: the scene loaded, the engine built, the chapter began. */
export async function waitForLive(page: Page): Promise<void> {
  await waitForJourney(page);
  await expect(page.locator("#anatomy")).toHaveClass(/is-live/, { timeout: 25_000 });
  await expect(page.locator("html")).toHaveAttribute("data-drawing", "live");
}

/** Holds the page to the still drawing for its session, as the quality floor does (J5-12): for specs about the still. */
export async function drawStill(page: Page): Promise<void> {
  await page.addInitScript(() => window.sessionStorage.setItem("tt.q", "still"));
}

/** Scrolls the pinned chapter to progress p (0–1): 0 as the pin takes hold, 1 as the chapter's foot reaches the
 * window's. Waits for the drawing to follow (its progress trails the scroll a little, by design, and a software GPU
 * under a parallel run draws few frames a second, so the wait is generous). */
export async function scrollIntoChapter(page: Page, p: number): Promise<void> {
  await page.evaluate((at) => {
    const section = document.getElementById("anatomy");
    const pin = section?.querySelector(".anatomy-pin");
    if (!section || !pin) throw new Error("#anatomy is missing");
    const stick = Number.parseFloat(getComputedStyle(pin).top) || 0;
    const start = section.getBoundingClientRect().top + window.scrollY - stick;
    const run = section.offsetHeight - window.innerHeight + stick;
    window.scrollTo({ top: start + run * at, behavior: "instant" });
  }, p);
  await expect.poll(() => page.evaluate(() => window.__ttJourney?.anatomy() ?? -1), { timeout: 20_000 }).toBeCloseTo(p, 1);
}

/** Scrolls the pinned run to progress p (0 as the pin takes hold, 1 at its end), then lets the page draw. Its place is
 * measured, never assumed: everything above it (the live drawing's 520vh pin, 02's 330vh) moves it. */
export async function scrollIntoRun(page: Page, p: number): Promise<void> {
  await page.evaluate((at) => {
    const run = document.getElementById("run");
    const pin = run?.querySelector<HTMLElement>(".run-pin");
    if (!run || !pin) throw new Error("#run is missing");
    const head = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
    const start = run.getBoundingClientRect().top + window.scrollY - head;
    window.scrollTo({ top: start + (run.offsetHeight - pin.offsetHeight) * at, behavior: "instant" });
  }, p);
  await frames(page, 2);
}

/** Aborts the scene chunk (three.js and the live drawing). */
export const blockSceneChunk = (page: Page): Promise<void> => blockChunk(page, SCENE_CHUNK_MARK);

/** From before the page's first script: scroll anchoring off, as a browser without it would be (Safari, every iOS
 * browser), moving the reader with any change of height above them that nothing compensates. */
export async function noAnchoring(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync("html { overflow-anchor: none; }");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  });
}

/** Scrolls instantly so a section's top sits `offset` px below the window's top. */
export async function scrollToId(page: Page, id: string, offset = 0): Promise<void> {
  await page.evaluate(
    ([target, by]) => {
      const el = document.getElementById(target);
      if (!el) throw new Error(`#${target} is missing`);
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - by, behavior: "instant" });
    },
    [id, offset] as const,
  );
}

/** An element's computed transform, with the identity written as "none" whichever way the browser spells it. */
export async function transformOf(locator: Locator): Promise<string> {
  const t = await locator.evaluate((el) => getComputedStyle(el).transform);
  return t === "matrix(1, 0, 0, 1, 0, 0)" ? "none" : t;
}

/** Motion off, as the footer switch stores it, before the page's first script. */
export async function motionOff(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.setItem("tt.motion", "off"));
}

/** Data Saver, stubbed via navigator.connection: on the prototype where this Chromium allows it, else the instance. */
export async function stubSaveData(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      Object.defineProperty(Navigator.prototype, "connection", { configurable: true, get: () => ({ saveData: true, effectiveType: "4g" }) });
    } catch {
      Object.defineProperty(window.navigator, "connection", { configurable: true, get: () => ({ saveData: true, effectiveType: "4g" }) });
    }
  });
}

/** Waits for the page to draw `n` more frames: whatever a scroll, a wheel or a layout event set going has had its turn.
 * A state wait, never a fixed time (J5 pre-flight #16). */
export async function frames(page: Page, n = 2): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((done) => {
        const tick = (left: number): void => {
          if (left <= 0) done();
          else requestAnimationFrame(() => tick(left - 1));
        };
        tick(count);
      }),
    n,
  );
}
