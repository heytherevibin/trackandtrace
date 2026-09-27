import { expect, test, type Page } from "@playwright/test";
import { blockJourneyChunk, waitForJourney } from "./journey-helpers";

/** Replaces Web Audio with a counter: contexts made, and knocks started. */
async function countAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __audio: { contexts: number; knocks: number } };
    w.__audio = { contexts: 0, knocks: 0 };
    class Param {
      value = 0;
      setValueAtTime() {}
      linearRampToValueAtTime() {}
      exponentialRampToValueAtTime() {}
    }
    class Node {
      gain = new Param();
      frequency = new Param();
      Q = new Param();
      type = "";
      buffer: unknown = null;
      connect<T>(next: T): T {
        return next;
      }
      start() {
        w.__audio.knocks += 1;
      }
      stop() {}
    }
    class Context {
      state = "running";
      currentTime = 0;
      sampleRate = 44_100;
      destination = {};
      constructor() {
        w.__audio.contexts += 1;
      }
      createGain() {
        return new Node();
      }
      createBufferSource() {
        return new Node();
      }
      createBiquadFilter() {
        return new Node();
      }
      createBuffer(_channels: number, length: number) {
        return { getChannelData: () => new Float32Array(length) };
      }
      resume() {
        return Promise.resolve();
      }
      close() {
        return Promise.resolve();
      }
    }
    Object.defineProperty(window, "AudioContext", { value: Context, configurable: true, writable: true });
  });
}
const audio = (page: Page) => page.evaluate(() => (window as unknown as { __audio: { contexts: number; knocks: number } }).__audio);
const scrollBy = (page: Page, px: number) => page.evaluate((by) => window.scrollBy({ top: by, behavior: "instant" }), px);

test.describe("the Sound switch", () => {
  test("is off by default, and scrolling is silent", async ({ page }) => {
    await countAudio(page);
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.getByRole("switch", { name: "Sound" })).not.toBeChecked();
    for (let i = 0; i < 6; i += 1) await scrollBy(page, 200);
    expect(await audio(page)).toEqual({ contexts: 0, knocks: 0 });
  });

  test("switching it on clacks once, and scrolling clacks with the rail", async ({ page }) => {
    await countAudio(page);
    await page.goto("/");
    await waitForJourney(page);
    const sw = page.getByRole("switch", { name: "Sound" });
    await sw.scrollIntoViewIfNeeded();
    await sw.click();
    await expect.poll(() => audio(page)).toEqual({ contexts: 1, knocks: 2 });
    for (let i = 0; i < 6; i += 1) {
      await scrollBy(page, -200);
      await page.waitForTimeout(100);
    }
    // the rail's knocks follow the scroll a frame or more later, which a busy runner may take a while to draw
    await expect.poll(async () => (await audio(page)).knocks).toBeGreaterThan(2);
  });

  test("remembered, yet silent until the reader's own gesture", async ({ page }) => {
    await countAudio(page);
    await page.addInitScript(() => window.localStorage.setItem("tt.sound", "on"));
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.getByRole("switch", { name: "Sound" })).toBeChecked();
    await scrollBy(page, 600);
    expect((await audio(page)).contexts).toBe(0);
    await page.mouse.click(5, 300);
    await expect.poll(async () => (await audio(page)).contexts).toBe(1);
  });

  test("absent when the journey cannot run", async ({ page }) => {
    await blockJourneyChunk(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-journey", "failed", { timeout: 15_000 });
    await expect(page.getByRole("switch", { name: "Sound" })).toBeHidden();
  });
});
