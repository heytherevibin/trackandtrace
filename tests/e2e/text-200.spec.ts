import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";
import { report, undersizedTargets } from "./targets";
import { breaksAt200, narrowFields, text200, wordsBrokenMidWord } from "./text-200";

// The 200% sweep's own readings (text-200.ts, targets.ts) against test-only boxes put on a real page, in its real type:
// each finds what it is for, and leaves alone what it must.

test("wordsBrokenMidWord finds a word cut where its line could hold it, and allows a hyphen's turn, a word longer than its line, and hyphenation", async ({ page }) => {
  await gotoReady(page, "/privacy");
  await page.evaluate(() => {
    for (const [id, style, text] of [
      ["cut", "width: 120px; word-break: break-all;", "Reservation availability"],
      ["hyphen", "width: 90px;", "pre-computed re-checking"],
      ["too-long", "width: 40px; overflow-wrap: break-word;", "Thiruvananthapuram"],
      ["hyphenated", "width: 90px; hyphens: auto;", "Reservation availability"],
      ["fits", "width: 300px;", "Reservation availability"],
    ] as const) {
      const p = document.createElement("p");
      p.id = id;
      p.lang = "en";
      p.setAttribute("style", `margin: 8px; font-size: 16px; ${style}`);
      p.textContent = text;
      document.querySelector("main")?.prepend(p);
    }
  });
  expect(await wordsBrokenMidWord(page, "#cut")).toContainEqual(expect.stringMatching(/^"(Reservation|availability)" \(\d+px\) is broken across lines of 120px in p$/));
  expect(await wordsBrokenMidWord(page, "#hyphen")).toEqual([]);
  expect(await wordsBrokenMidWord(page, "#too-long")).toEqual([]);
  expect(await wordsBrokenMidWord(page, "#hyphenated")).toEqual([]);
  expect(await wordsBrokenMidWord(page, "#fits")).toEqual([]);
});

test("narrowFields finds a field too narrow to type in, and no field of a usable width", async ({ page }) => {
  await gotoReady(page, "/privacy");
  await page.evaluate(() => {
    for (const [label, width] of [
      ["Narrow", 80],
      ["Usable", 160],
    ] as const) {
      const input = document.createElement("input");
      input.setAttribute("aria-label", label);
      input.setAttribute("style", `display: block; box-sizing: border-box; width: ${width}px; margin: 8px;`);
      document.querySelector("main")?.prepend(input);
    }
  });
  const found = await narrowFields(page);
  expect(found.filter((f) => f.includes('"Narrow"'))).toEqual(['the field "Narrow" is 80px wide, under 120px']);
  expect(found.filter((f) => f.includes('"Usable"'))).toEqual([]);
});

test("the hit-walk credits a label wrapped round its radio, and not a bare radio", async ({ page, isMobile }) => {
  test.skip(!isMobile, "tap targets are a touch-screen concern");
  await gotoReady(page, "/privacy");
  await page.evaluate(() => {
    const box = document.createElement("div");
    box.id = "radios";
    box.setAttribute("style", "padding: 40px;");
    const label = document.createElement("label");
    label.setAttribute("style", "display: flex; align-items: center; min-height: 44px; width: 200px;");
    const inside = document.createElement("input");
    inside.type = "radio";
    inside.setAttribute("aria-label", "In a label");
    inside.setAttribute("style", "width: 16px; height: 16px; margin: 0;");
    label.append(inside, " A choice");
    const bare = document.createElement("input");
    bare.type = "radio";
    bare.setAttribute("aria-label", "Bare");
    bare.setAttribute("style", "display: block; width: 16px; height: 16px; margin: 40px 0 0;");
    box.append(label, bare);
    document.querySelector("main")?.prepend(box);
  });
  const missed = report(await undersizedTargets(page, "#radios"));
  expect(missed).toEqual([expect.stringMatching(/^Bare \[16x16\] reaches 16x16$/)]);
});

test("the sweep refuses to measure a page whose text is not at 200%", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the sweep reads tap targets, a touch screen's");
  await gotoReady(page, "/privacy");
  await expect(breaksAt200(page)).rejects.toThrow(/not at 200%/);
  // and with the text at 200% from before the first paint, the same page is measured
  await text200(page);
  await gotoReady(page, "/privacy");
  expect(await breaksAt200(page)).toEqual([]);
});
