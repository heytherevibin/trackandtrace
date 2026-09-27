import { expect, type Locator, type Page } from "@playwright/test";
import { JOURNEY_CHUNK_MARK } from "@/components/landing/journey/journey-mark";

/** The journey marks <html data-journey="on"> once it has taken the page over. */
export async function waitForJourney(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-journey", "on", { timeout: 15_000 });
}

/** Aborts the one script chunk that carries the journey, found by its content, so its hashed name never matters. */
export async function blockJourneyChunk(page: Page): Promise<void> {
  await page.route("**/_next/static/**/*.js", async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes(JOURNEY_CHUNK_MARK)) return route.abort();
    return route.fulfill({ response, body });
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
