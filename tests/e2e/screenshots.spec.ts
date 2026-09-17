import { mkdirSync } from "node:fs";
import { test } from "./fixtures";
import { PNR, gotoReady } from "./helpers";

// Captures the finish-review evidence. Run with SCREENSHOTS=1 npm run screenshots.
test("capture review screenshots", async ({ page }, testInfo) => {
  test.skip(process.env.SCREENSHOTS !== "1", "screenshot run only");
  mkdirSync(".impeccable/review", { recursive: true });
  const name = testInfo.project.name;

  /** Walk the page so every reveal-on-view section has entered, then return to the top. */
  const settle = async () => {
    await page.evaluate(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += window.innerHeight / 2) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(600);
  };

  await gotoReady(page, "/");
  await settle();
  await page.screenshot({ path: `.impeccable/review/${name}.png`, fullPage: true });
  await gotoReady(page, `/pnr/${PNR.cnf}`);
  await settle();
  await page.screenshot({ path: `.impeccable/review/${name}-result.png`, fullPage: true });
});
