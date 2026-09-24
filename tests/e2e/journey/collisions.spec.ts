import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { gotoReady } from "../helpers";
import { collisionsInView, collisionsTopToBottom } from "./collisions";

/** Draws two probe lines, the second `gap` px below the first, fixed where the window shows them. */
async function drawProbeLines(page: Page, gap: number): Promise<void> {
  await page.evaluate((offset) => {
    for (const [text, top] of [
      ["Probe line one", 240],
      ["Probe line two", 240 + offset],
    ] as const) {
      const line = document.createElement("p");
      line.textContent = text;
      line.style.cssText = `position:fixed;left:40px;top:${top}px;margin:0;font:16px/20px sans-serif;z-index:9999`;
      document.body.append(line);
    }
  }, gap);
}

// The checker proves itself first: a checker that finds nothing, ever, would pass every baseline below.
test.describe("the collision checker", () => {
  test("sees two lines of text drawn over each other", async ({ page }) => {
    await gotoReady(page, "/");
    await drawProbeLines(page, 6);
    expect(await collisionsInView(page)).toContain('text "Probe line one" × text "Probe line two"');
  });

  test("lets two lines that only touch pass", async ({ page }) => {
    await gotoReady(page, "/");
    await drawProbeLines(page, 20);
    expect(await collisionsInView(page)).not.toContain('text "Probe line one" × text "Probe line two"');
  });

  test("sees a panel drawn over text outside it", async ({ page }) => {
    await gotoReady(page, "/");
    await drawProbeLines(page, 40);
    await page.evaluate(() => {
      const panel = document.createElement("div");
      panel.id = "probe-panel";
      panel.style.cssText = "position:fixed;left:20px;top:230px;width:300px;height:40px;z-index:9999";
      document.body.append(panel);
    });
    expect(await collisionsInView(page, { panels: ["#probe-panel"] })).toContain('panel div#probe-panel × text "Probe line one"');
  });

  test("does not see the answer inside a closed <details>, only its question", async ({ page }) => {
    await gotoReady(page, "/");
    await drawProbeLines(page, 20);
    await page.evaluate(() => {
      const details = document.createElement("details");
      details.innerHTML = '<summary>Probe question</summary><p style="margin:0">Probe answer</p>';
      details.style.cssText = "position:fixed;left:40px;top:240px;margin:0;font:16px/20px sans-serif;z-index:9999";
      document.body.append(details);
    });
    const found = await collisionsInView(page);
    expect(found).toContain('text "Probe line one" × text "Probe question"');
    expect(found).not.toContain('text "Probe line two" × text "Probe answer"');
  });

  test("sees a page that scrolls sideways", async ({ page }) => {
    await gotoReady(page, "/");
    await page.evaluate(() => {
      const wide = document.createElement("div");
      wide.style.cssText = "width:200vw;height:1px";
      document.body.append(wide);
    });
    expect((await collisionsInView(page)).some((finding) => finding.startsWith("sideways overflow"))).toBe(true);
  });
});

// Today's landing, before the journey adds anything: the baseline every journey PR must keep.
const SIZES = [
  { name: "1440×900", viewport: { width: 1440, height: 900 }, phone: false },
  { name: "390×844", viewport: { width: 390, height: 844 }, phone: true },
  { name: "844×390, a phone on its side", viewport: { width: 844, height: 390 }, phone: true },
] as const;

for (const size of SIZES) {
  test.describe(`the landing at ${size.name}`, () => {
    test.use({ viewport: size.viewport });
    test.skip(({ isMobile }) => isMobile !== size.phone, "each size runs once, in the project that emulates its device");

    for (const motion of ["on", "off"] as const) {
      test(`Motion ${motion}: nothing collides, top to bottom`, async ({ page }) => {
        if (motion === "off") await page.addInitScript(() => window.localStorage.setItem("tt.motion", "off"));
        await gotoReady(page, "/");
        expect(await collisionsTopToBottom(page)).toEqual([]);
      });
    }
  });
}
