import { expect, test, type Locator, type Page } from "@playwright/test";
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

/** Aborts the one script chunk that carries `mark`, found by its content, so its hashed name never matters. The
 * harness's own fetch of a chunk can fail under load (WebKit at four workers or more: `route.fetch: write EPIPE`, or
 * ECONNRESET from the dev server), which is the harness's, not the page's: it is tried once more, then the request goes
 * through untouched, and the test's own assertion decides. */
export async function blockChunk(page: Page, mark: string): Promise<void> {
  await page.route("**/_next/static/**/*.js", async (route) => {
    const read = async () => {
      const response = await route.fetch();
      return { response, body: await response.text() };
    };
    const got = await read().catch(() => read().catch(() => null));
    if (!got) return route.continue();
    if (got.body.includes(mark)) return route.abort();
    return route.fulfill({ response: got.response, body: got.body });
  });
}

/** Aborts the journey chunk. */
export const blockJourneyChunk = (page: Page): Promise<void> => blockChunk(page, JOURNEY_CHUNK_MARK);

/** The drawing is live and pinned: the scene loaded, the engine built, the chapter began. Where the browser cannot draw
 * it at all (a WebKit with no WebGL 2), the test skips there, saying so (skipWithoutWebgl2). */
export async function waitForLive(page: Page): Promise<void> {
  await waitForJourney(page);
  await skipWithoutWebgl2(page);
  await expect(page.locator("#anatomy")).toHaveClass(/is-live/, { timeout: 25_000 });
  await expect(page.locator("html")).toHaveAttribute("data-drawing", "live");
}

/** WebKit on a GPU-less Linux runner (the nightly's webkit projects, J6-12) may have no WebGL 2: there the live drawing
 * cannot be drawn at all, so a test that needs it skips, saying so, instead of failing on the missing context. One
 * place for every spec: waitForLive calls it (place, drawing-modes, night-falls), and live-drawing.spec.ts's own skip
 * reuses it. Chromium always runs them. */
export async function skipWithoutWebgl2(page: Page): Promise<void> {
  if (page.context().browser()?.browserType().name() !== "webkit") return;
  const webgl2 = await page.evaluate(() => document.createElement("canvas").getContext("webgl2") !== null);
  test.info().skip(!webgl2, "this WebKit has no WebGL 2: the live drawing is proven in Chromium and on the owner's devices");
}

/** The install prompt an iPhone gets (its user agent: the nightly's webkit-phone), a plate fixed over the page's foot:
 * dismissed through its own control, as a reader would, before a spec reads the page under it. Nowhere else it shows. */
export async function dismissInstall(page: Page): Promise<void> {
  const prompt = page.getByTestId("install-prompt");
  if (!(await prompt.isVisible())) return;
  await prompt.getByTestId("install-dismiss").click();
  await expect(prompt).toBeHidden();
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

/** What happens two frames after a Tab stop takes focus, mid-glide: the drawing above falls to the still (the GPU drops
 * its context), or the reader leaves by a drag, an instant scroll to 01's top 100px down the window, which sends no
 * wheel, touch or key. */
export type MidGlide = "lost" | "away";

/** Readies a keyboard move onto the link named `name` inside `within`: its preceding Tab stop takes focus without
 * scrolling, so the next Tab lands on the link as a reader's would; `then` happens two frames after it does. */
export async function readyTab(page: Page, within: string, name: string, then?: MidGlide): Promise<void> {
  await page.evaluate(
    ([scope, text, mid]) => {
      const stops = [...document.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select, textarea, [tabindex]")].filter(
        (el) => el.tabIndex >= 0 && el.checkVisibility(),
      );
      const target = [...document.querySelectorAll<HTMLElement>(`${scope} a`)].find((a) => a.textContent?.includes(text));
      const before = target ? stops[stops.indexOf(target) - 1] : undefined;
      if (!target || !before) throw new Error(`no Tab stop before "${text}" in ${scope}`);
      before.focus({ preventScroll: true });
      if (!mid) return;
      const act = () => {
        if (mid === "lost") window.dispatchEvent(new CustomEvent("tt:webgl", { detail: "lost" }));
        else {
          const principles = document.getElementById("principles");
          if (!principles) throw new Error("#principles is missing");
          window.scrollTo({ top: principles.getBoundingClientRect().top + window.scrollY - 100, behavior: "instant" });
        }
      };
      target.addEventListener("focus", () => requestAnimationFrame(() => requestAnimationFrame(act)), { once: true });
    },
    [within, name, then ?? null] as const,
  );
}

/** Tab as the reader's browser takes it through links: Option-Tab (Alt+Tab) in WebKit on macOS, where a bare Tab skips
 * links unless the system's keyboard navigation is on (Safari's own default, which Playwright's WebKit keeps there);
 * Tab everywhere else. The page knows both for a Tab (focus-glide.ts's watchTab). `back`: Shift with it. */
export async function pressTab(page: Page, back = false): Promise<void> {
  const webkit = page.context().browser()?.browserType().name() === "webkit";
  await page.keyboard.press(`${webkit && process.platform === "darwin" ? "Alt+" : ""}${back ? "Shift+" : ""}Tab`);
}

/** The page has held its scroll for `n` frames: at rest. */
export async function atRest(page: Page, n = 10): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((done) => {
        let last = window.scrollY;
        let held = 0;
        const tick = () => {
          held = window.scrollY === last ? held + 1 : 0;
          last = window.scrollY;
          if (held >= count) done();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    n,
  );
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

/** From before the page's first script: every frame, whether anything matching `selector` stands off its rest (any
 * transform but none), counted in window.__ttMoved, so a spec can tell whether an entrance played while it could not
 * be watching (at load, as the journey starts). Read it with movedFrames; zero it with resetMoved. */
export async function watchMotion(page: Page, selector: string): Promise<void> {
  await page.addInitScript((sel) => {
    const w = window as unknown as { __ttMoved: number };
    w.__ttMoved = 0;
    const look = () => {
      const moved = [...document.querySelectorAll(sel)].some((el) => {
        const t = getComputedStyle(el).transform;
        return t !== "none" && t !== "matrix(1, 0, 0, 1, 0, 0)";
      });
      if (moved) w.__ttMoved += 1;
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  }, selector);
}

/** How many frames watchMotion has seen something off its rest in, since the load or the last resetMoved. */
export const movedFrames = (page: Page): Promise<number> => page.evaluate(() => Reflect.get(window, "__ttMoved") as number);

/** Zeroes watchMotion's count. */
export const resetMoved = (page: Page): Promise<void> => page.evaluate(() => void Reflect.set(window, "__ttMoved", 0));
