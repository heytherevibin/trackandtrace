import { statSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { frames, scrollIntoChapter, scrollIntoRun, scrollToId, waitForLive } from "../journey/journey-helpers";

// Nightly (spec §5): every chapter of the landing photographed in Day, Night and on a phone, kept as the run's artifact
// for a person to look at. It asserts only that each place was reached and photographed; the pictures are the evidence.

/** The run's track glides to its place over some sixty frames after a jump (run.ts eases it): a photograph taken
 * sooner shows it mid-glide. Waits, on state, until the track's transform has held for ten frames. Called at every
 * place: away from the run the track stands still, so it returns in ten frames. */
async function runAtRest(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((done) => {
        const read = () => {
          const track = document.querySelector(".run-track");
          return track ? getComputedStyle(track).transform : "";
        };
        let last = read();
        let held = 0;
        const tick = (): void => {
          const now = read();
          held = now === last ? held + 1 : 0;
          last = now;
          if (held >= 10) done(true);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    undefined,
    { timeout: 20_000 },
  );
}

type Place = readonly [name: string, go: (page: Page) => Promise<void>];

const at = (id: string, offset = 40) => (page: Page) => scrollToId(page, id, offset);
const PLACES: readonly Place[] = [
  ["01-top", (page) => page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))],
  ["02-drawing-scan", (page) => scrollIntoChapter(page, 0.05)],
  ["03-drawing-apart", (page) => scrollIntoChapter(page, 0.4)],
  ["04-drawing-dimensions", (page) => scrollIntoChapter(page, 0.65)],
  ["05-drawing-departing", (page) => scrollIntoChapter(page, 0.93)],
  ["06-principles", at("principles")],
  ["07-how", at("how", -200)],
  ["08-record", at("record")],
  ["09-reliability", at("reliability")],
  ["10-roadmap", at("roadmap")],
  ["11-run-start", (page) => scrollIntoRun(page, 0)],
  ["12-run-middle", (page) => scrollIntoRun(page, 0.5)],
  ["13-run-end", (page) => scrollIntoRun(page, 1)],
  ["14-faq", at("faq")],
  ["15-terminus", at("terminus")],
];

const FACES = [
  { face: "day", theme: "light", viewport: { width: 1440, height: 900 }, phone: false },
  { face: "night", theme: "dark", viewport: { width: 1440, height: 900 }, phone: false },
  { face: "phone", theme: "light", viewport: { width: 390, height: 844 }, phone: true },
] as const;

for (const { face, theme, viewport, phone } of FACES) {
  test.describe(face, () => {
    test.use({ viewport, isMobile: phone, hasTouch: phone });

    test(`every chapter, photographed (${face})`, async ({ page }, info) => {
      test.setTimeout(300_000);
      await page.addInitScript((t) => window.localStorage.setItem("tt.theme", t), theme);
      await page.goto("/");
      await waitForLive(page);
      for (const [name, go] of PLACES) {
        await go(page);
        await frames(page, 6);
        await runAtRest(page);
        const path = info.outputPath(`${face}-${name}.png`);
        await page.screenshot({ path });
        expect(statSync(path).size, `${face} ${name}`).toBeGreaterThan(0);
      }
    });
  });
}
