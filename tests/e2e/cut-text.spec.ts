import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";
import { cutText } from "./layout";

// cutText (layout.ts) against test-only boxes put on a real page, in its real type: text cut at its foot, by a line
// clamp or by a box too short for its lines, is found; the same boxes holding all their text are not.
const LONG = "Every word of this sentence has to be read to its end, and it runs well past two lines of its box.";
const CLAMP = "display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;";
const SHORT_BOX = "height: 1.5em; line-height: 1.5; overflow: hidden;";

test("cutText finds a line-clamped paragraph and a box that cuts its text at its foot, and nothing that fits", async ({ page }) => {
  await gotoReady(page, "/privacy");
  await page.evaluate(
    ({ long, clamp, shortBox }) => {
      for (const [id, style, text] of [
        ["clamped", clamp, long],
        ["short-box", shortBox, long],
        ["clamped-fits", clamp, "Short."],
        ["box-fits", shortBox, "Short."],
      ] as const) {
        const wrap = document.createElement("div");
        wrap.id = id;
        const p = document.createElement("p");
        p.setAttribute("style", `width: 160px; margin: 8px; ${style}`);
        p.textContent = text;
        wrap.append(p);
        document.querySelector("main")?.prepend(wrap);
      }
    },
    { long: LONG, clamp: CLAMP, shortBox: SHORT_BOX },
  );
  const cutAtFoot = /^"Every word of this sentence has to be re" is cut off at its foot by its own box \(\d+px\)$/;
  expect(await cutText(page, "#clamped")).toEqual([expect.stringMatching(cutAtFoot)]);
  expect(await cutText(page, "#short-box")).toEqual([expect.stringMatching(cutAtFoot)]);
  expect(await cutText(page, "#clamped-fits")).toEqual([]);
  expect(await cutText(page, "#box-fits")).toEqual([]);
});
