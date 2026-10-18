import { expect, test } from "../fixtures";
import { PNR } from "../helpers";
import { motionOff, transformOf } from "./journey-helpers";
import { MORPH_MS, PLATE, REST_FRAMES, faceTransformsFromFirstPaint, fill, hydrated, letGo, open, recordPlate, recordRun, rested, run, watchHeights, type PlateFrame } from "./plate-morph-helpers";

test.describe("the plate morph", () => {
  test("Motion off: the first face never rises, from first paint on", async ({ page }) => {
    await motionOff(page);
    const transforms = await faceTransformsFromFirstPaint(page);
    expect(transforms.length).toBeGreaterThanOrEqual(10);
    expect(new Set(transforms)).toEqual(new Set(["none"]));
  });

  test("Motion on: the first face never rises either, from first paint on", async ({ page }) => {
    const transforms = await faceTransformsFromFirstPaint(page);
    expect(transforms.length).toBeGreaterThanOrEqual(10);
    expect(new Set(transforms)).toEqual(new Set(["none"]));
  });

  // The tests below that read the morph's frames read every one, from before the press until the record is drawn and
  // the plate has come to rest (recordPlate), on a page that has finished starting (open). They once pressed as the page
  // loaded and sampled a fixed 3 s or 2.4 s: the samples ended a hair before the face had settled (0.004px off rest),
  // or before the record had come at all (no rise in any sample), whenever the press or the answer was slow; and the
  // live drawing's first frame, landing on the morph, left one height sample between the faces, or none.
  test("a change of face rises 8px with Motion on, and settles still", async ({ page }) => {
    await open(page);
    await fill(page);
    const recording = await recordRun(page);
    const entry = recording.frames.filter((frame) => !frame.record).map((frame) => frame.rise);
    const record = recording.frames.filter((frame) => frame.record).map((frame) => frame.rise);
    // only the record rises: the entry stands at rest while the check runs
    expect(new Set(entry)).toEqual(new Set([0]));
    // it really rises: more than a pixel off its rest, and no more than the 8px it starts from
    expect(Math.max(...record)).toBeGreaterThan(1);
    expect(Math.max(...record)).toBeLessThanOrEqual(8);
    // it ends exactly still: no offset drawn, none left written
    expect(record.at(-1)).toBe(0);
    expect(recording.frames.at(-1)?.inline.transform).toBe("");
    expect(await transformOf(page.locator(`${PLATE} > div`))).toBe("none");
    // and on the way it only comes to rest: no frame is further off than the one before it
    expect(record.filter((y, i) => i > 0 && y > record[i - 1]!), "offsets the record climbed back to").toEqual([]);
  });

  test("Motion off: a change of face swaps at once, with no rise", async ({ page }) => {
    await motionOff(page);
    await open(page);
    await fill(page);
    const recording = await recordRun(page);
    // the frames span the record's arrival and its rest: a recording that ended before the record came proves nothing
    expect(recording.frames.filter((frame) => frame.record).length).toBeGreaterThanOrEqual(REST_FRAMES);
    expect(new Set(recording.frames.map((frame) => frame.rise))).toEqual(new Set([0]));
  });

  // How many frames show the plate between its two heights is the runner's doing, not the plate's: the tween lasts
  // 420 ms whatever the frame rate, so a 120 Hz runner draws fifty frames of it and a loaded one a handful (14 at the
  // least at 6x CPU with three workers). The count of three this test once asked for is replaced by what a tween is at
  // any frame rate, judged by when each frame was drawn:
  // - it is seen on the way: at least one frame strictly between the two heights (a snap has none);
  // - it takes its time: no frame drawn in the tween's first quarter is at the record's height yet. The tween is 17%
  //   short of it there; a snap, or a jump in two steps (the record drawn at one height and at another a frame later,
  //   as a record that stacked late once was), has arrived within a frame or two. On any runner that draws three frames
  //   in 105 ms this asks more than the count did;
  // - it only grows: no frame is shorter than the one before it.
  test("the record grows out of the plate", async ({ page }) => {
    await open(page);
    await fill(page);
    const recording = await recordRun(page);
    const drawn = recording.frames.filter((frame) => frame.record);
    // From the entry's height as the record replaced it, not as it stood before the press (on a phone the entry loses
    // its Clear button as the check starts, and is shorter for it), to the height the record rests at.
    const from = recording.frames.filter((frame) => !frame.record).at(-1)?.height ?? Number.NaN;
    const rest = drawn.at(-1)?.height ?? Number.NaN;
    expect(rest - from, `the record's ${rest}px against the entry's ${from}px: there is a way to grow`).toBeGreaterThan(20);
    expect(recording.changed, "the record's commit was seen").not.toBeNull();
    const since = (frame: PlateFrame) => Math.round(frame.at - (recording.changed ?? Number.NaN));
    const between = drawn.filter((frame) => frame.height > from + 2 && frame.height < rest - 2);
    expect(between.length, "frames drawn between the two heights").toBeGreaterThanOrEqual(1);
    const early = drawn.filter((frame) => since(frame) <= MORPH_MS / 4);
    expect(early.filter((frame) => frame.height >= rest - 2).map((frame) => `${frame.height}px at ${since(frame)} ms`), `frames in the tween's first quarter already at the record's ${rest}px`).toEqual([]);
    expect(drawn.filter((frame, i) => i > 0 && frame.height < drawn[i - 1]!.height - 1).map((frame) => `${frame.height}px at ${since(frame)} ms`), "frames shorter than the one before").toEqual([]);
    // and the plate ends at its content's own height: nothing the morph wrote is left on it
    expect(await page.locator(PLATE).evaluate((el) => (el as HTMLElement).style.height)).toMatch(/^(auto|)$/);
  });

  test("Motion off: the record appears at once", async ({ page }) => {
    await motionOff(page);
    await open(page);
    await fill(page);
    const recording = await recordRun(page);
    const heights = recording.frames.map((frame) => Math.round(frame.height));
    const final = heights.at(-1)!;
    expect(final - heights[0]!, "the record is taller than the entry: a tween would have had a way to go").toBeGreaterThan(20);
    // Distinct values, not raw samples: the entry face's own running state (unrelated to the morph, still
    // its own face throughout) settles through one incidental plateau of its own before the result lands. A
    // real tween reads through dozens of distinct heights on its way; one incidental one is not that.
    const between = new Set(heights.filter((h) => h > heights[0]! + 2 && h < final - 2));
    expect(between.size).toBeLessThan(3);
  });

  test("checking another PNR morphs back, and the entry takes the caret", async ({ page }) => {
    await open(page);
    await run(page);
    await page.getByRole("button", { name: /check another pnr/i }).click();
    await expect(page.getByTestId("hero-instrument").getByRole("textbox")).toBeFocused();
    await expect(page.getByTestId("terminal-result")).toHaveCount(0);
  });

  test("Motion switched off mid-rise stops the face where it rests", async ({ page }) => {
    await open(page);
    await fill(page);
    // All in the page, frame-timed: catch the record face mid-rise (moving, between its start and rest), flip
    // the footer's switch, read the face's own inline transform at once, then its drawn offset every frame for
    // longer than the rest of the rise's 420ms. The face must never move on from where the switch found it:
    // every frame reads that offset or rest, and it ends at rest. (The drawn value can hold for a frame or
    // two after the inline transform is cleared: the site's Motion-off rule gives every element a 0.01ms
    // transition, motion.css, which the browser only starts and ends on later frames.)
    const run = page.getByTestId("hero-instrument").getByRole("button", { name: /run/i });
    const toggle = await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).elementHandle();
    const read = page.evaluate(
      (motionSwitch) =>
        new Promise<{ readonly before: number; readonly inline: string; readonly after: number[] }>((resolve) => {
          const offset = (el: Element) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
          const face = () => document.querySelector<HTMLElement>('[data-testid="hero-instrument"] .plate-morph > div');
          const sample = (before: number, inline: string, after: number[], end: number) => {
            const now = face();
            if (now) after.push(offset(now));
            if (performance.now() < end) requestAnimationFrame(() => sample(before, inline, after, end));
            else resolve({ before, inline, after });
          };
          const waitForRise = () => {
            const el = face();
            const y = el?.querySelector('[data-testid="terminal-result"]') ? offset(el) : 0;
            if (!el || y <= 0.5 || y >= 7.5) return requestAnimationFrame(waitForRise);
            (motionSwitch as HTMLElement).click();
            const inline = el.style.transform;
            requestAnimationFrame(() => sample(y, inline, [], performance.now() + 600));
          };
          requestAnimationFrame(waitForRise);
        }),
      toggle,
    );
    await run.click();
    const { before, inline, after } = await read;
    await expect(page.getByTestId("terminal-result")).toHaveAttribute("data-kind", "ok");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    expect(before).toBeGreaterThan(0.5);
    expect(inline).toBe("");
    expect(after.length).toBeGreaterThanOrEqual(10);
    expect(after.filter((y) => y !== before && y !== 0)).toEqual([]);
    expect(after.slice(after.indexOf(0))).toEqual(after.slice(after.indexOf(0)).map(() => 0));
    expect(after.at(-1)).toBe(0);
  });

  test("under a slow CPU the plate still ends at its content's own height", async ({ page }) => {
    test.setTimeout(90_000);
    // The morph once left the plate at its tween's last pixel height when the tween's completion landed
    // late (reproduced only with the CPU throttled). A few throttled runs, each read once the plate has come to rest.
    // Hydrated, and no more (not `open`): the journey and the drawing start when they start, under the morph or after
    // it, as they did when this was found. Only the end is read here, which no stall can spoil.
    const cdp = await page.context().newCDPSession(page);
    for (const rate of [4, 6, 8]) {
      await cdp.send("Emulation.setCPUThrottlingRate", { rate });
      await page.goto("/");
      await hydrated(page);
      await fill(page);
      await recordRun(page);
      expect(await page.locator(PLATE).evaluate((el) => (el as HTMLElement).style.height), `at ${rate}x`).toMatch(/^(auto|)$/);
    }
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  });

  test("Motion off mid-morph ends at the new face's own height", async ({ page }) => {
    await open(page);
    await fill(page);
    // In the page, frame by frame: as soon as the plate is growing (an inline height on it) and the record's button is
    // there, Motion is switched off, the way the other journey specs do; a frame later the faces are swapped again, the
    // first tween still in flight. Both land at a share of the morph, never at a time after it began: a wait of 100 ms
    // and two presses from the runner found the tween over on a slow one, and the test passed without its case.
    const toggle = await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).elementHandle();
    const swapped = page.evaluate(
      ([selector, motionSwitch]) =>
        new Promise<{ readonly atSwitch: string; readonly atSwap: string }>((resolve, reject) => {
          const end = performance.now() + 20_000;
          const plate = () => document.querySelector<HTMLElement>(selector as string);
          const another = () => [...(plate()?.querySelectorAll("button") ?? [])].find((button) => /check another pnr/i.test(button.textContent ?? ""));
          const tick = () => {
            const el = plate();
            if (el && another() && el.style.height !== "") {
              const atSwitch = el.style.height;
              (motionSwitch as HTMLElement).click();
              return requestAnimationFrame(() => {
                const atSwap = el.style.height;
                another()?.click();
                resolve({ atSwitch, atSwap });
              });
            }
            if (performance.now() > end) return reject(new Error("the record never grew"));
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
      [PLATE, toggle] as const,
    );
    await page.getByTestId("hero-instrument").getByRole("button", { name: /run/i }).click();
    const { atSwitch, atSwap } = await swapped;
    expect(atSwitch, "Motion was switched off while the plate was growing").not.toBe("");
    expect(atSwap, "and the faces swapped again while it still was: the case this test is about").not.toBe("");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    // Recorded from the swap (the entry at rest before the press is not the rest meant) until the entry is back and
    // the plate at rest, however long the interrupted tween's own 420 ms schedule takes to pass on this runner: a
    // write it had left to make would be a frame that changed.
    rested(await (await recordPlate(page, "entry"))());
    await expect(page.getByTestId("terminal-result")).toHaveCount(0);
    const wrapper = page.locator(PLATE);
    expect(await wrapper.evaluate((el) => (el as HTMLElement).style.height)).toMatch(/^(auto|)$/);
    const box = await wrapper.boundingBox();
    const contentBox = await wrapper.locator(":scope > *").first().boundingBox();
    expect(Math.abs((box?.height ?? 0) - (contentBox?.height ?? 0))).toBeLessThanOrEqual(1);
  });

  test("checking another PNR while the record is still growing writes no height below the entry's", async ({ page, isMobile }) => {
    test.skip(!isMobile, "once is enough");
    await open(page);
    await fill(page, PNR.mixed);
    await watchHeights(page);
    // In the page, frame by frame: as soon as the plate is growing (an inline height on it) and the record's button is
    // there, press it. The press lands at a share of the morph, never at a time.
    const pressed = page.evaluate(
      () =>
        new Promise<number>((resolve, reject) => {
          const end = performance.now() + 20_000;
          const tick = () => {
            const el = document.querySelector<HTMLElement>('[data-testid="hero-instrument"] .plate-morph');
            const another = [...(el?.querySelectorAll("button") ?? [])].find((button) => /check another pnr/i.test(button.textContent ?? ""));
            if (el && another && el.style.height !== "") {
              const at = Number.parseFloat(el.style.height);
              another.click();
              return resolve(at);
            }
            if (performance.now() > end) return reject(new Error("the record never grew"));
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    await page.getByTestId("hero-instrument").getByRole("button", { name: /run/i }).click();
    const at = await pressed;
    await expect(page.getByTestId("terminal-result")).toHaveCount(0);
    await letGo(page);
    const written = await page.evaluate(() => (window as unknown as { __written: number[] }).__written);
    // the first height written is the entry's own, where the growth started from
    const entry = written[0] ?? 0;
    expect(at, "pressed while the plate was growing, an inline height on it: the case this test is about").toBeGreaterThanOrEqual(entry);
    // Neubrutal v4's running face carries its three stops, so it stands taller than the idle entry the plate goes back
    // to: the floor is the lower of the two, and nothing is written below where the plate comes to rest.
    const floor = Math.min(entry, written.at(-1) ?? entry);
    expect(written.filter((height) => height < floor - 2), `every height written, against the floor of ${floor}px`).toEqual([]);
  });
});
