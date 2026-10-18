import { statSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { frames, scrollToId, scrollToTerminus, waitForLive } from "../journey/journey-helpers";

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
  ["02-principles", at("principles")],
  ["03-how", at("how")],
  ["04-reliability", at("reliability")],
  ["05-roadmap", at("roadmap")],
  ["06-faq", at("faq")],
  ["07-terminus", (page) => scrollToTerminus(page)],
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
