import { expect, test } from "../fixtures";
import { scrollIntoChapter, waitForLive } from "../journey/journey-helpers";

// Nightly (spec §4, §5): a device too slow to draw. Its frames run past the governor's 120 ms gesture gap, which it once
// took for a new gesture every frame, so it never stepped (the nightly's 10× run on Linux, J6). Nightly, not per PR: at
// 60× CPU it takes over a minute a project here and minutes on a slow core, and how slow 60× is depends on the machine;
// the governor's own rules are unit-tested on every PR (governor.test.ts). The CPU is slowed only once the drawing is
// live, so the load is not the spec's. The page scrolls once a frame inside the chapter, as a reader's continued gesture
// does, until the still or FRAMES frames: bounded by frames, not by the clock, so a loaded machine only runs it slower.
// Frames must run past 120 ms, or the old governor would step too and the spec would prove nothing.
test("a device too slow to draw steps quality down as the reader scrolls, then draws still (quality)", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CPU throttling is Chromium's (CDP)");
  const RATE = 60;
  const FRAMES = 300; // the floor takes 123 counted frames from full quality (31 + 46 + 46)
  test.setTimeout(420_000); // FRAMES at up to a second each, the load and the unthrottled start
  await page.addInitScript(() => {
    // the floor is this spec's subject: tests/e2e/fixtures.ts's hold is let go, whichever init script runs first
    Object.defineProperty(window, "__ttHoldFloor", { configurable: true, get: () => false, set: () => undefined });
    const steps: string[] = [];
    Reflect.set(window, "__ttSteps", steps);
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
      if (key === "tt.q") steps.push(value);
      Reflect.apply(setItem, this, [key, value]);
    };
  });
  await page.goto("/");
  await waitForLive(page);
  await scrollIntoChapter(page, 0.2);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: RATE });
  const gaps = await page.evaluate(
    (frames) =>
      new Promise<number[]>((done) => {
        const seen: number[] = [];
        let last = 0;
        let n = 0;
        const tick = (t: number): void => {
          if (last) seen.push(t - last);
          last = t;
          if (document.documentElement.dataset.drawingWhy === "quality" || n >= frames) return done(seen);
          window.scrollBy({ top: n % 16 < 8 ? 150 : -150, behavior: "instant" });
          n += 1;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    FRAMES,
  );
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] ?? 0;
  expect(median, `this machine draws too fast at ${RATE}× for the spec to test the fault: the median frame gap must run past the governor's 120 ms gesture gap (raise RATE)`).toBeGreaterThan(120);
  await expect(page.locator("html")).toHaveAttribute("data-drawing-why", "quality");
  await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
  expect(await page.evaluate(() => Reflect.get(window, "__ttSteps"))).toEqual(["1", "2", "still"]);
});
