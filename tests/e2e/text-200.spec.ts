import { expect, test } from "./fixtures";
import { PNR, axeResults, gotoReady } from "./helpers";
import { waitForJourney } from "./journey/journey-helpers";
import { cutText, layoutBreaks } from "./layout";
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
      // a box that hyphenates may turn a word at a syllable; it may not cut one anywhere (break-all), nor a short one
      ["hyphenated-cut", "width: 90px; hyphens: auto; word-break: break-all;", "A Reservation"],
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
  expect(await wordsBrokenMidWord(page, "#hyphenated-cut")).not.toEqual([]);
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

test("narrowFields finds a field too narrow for the value it holds, and not one that shows its whole value", async ({ page }) => {
  await gotoReady(page, "/privacy");
  await page.evaluate(() => {
    for (const [label, value] of [
      ["Cut", "A value much longer than its field shows"],
      ["Whole", "Short"],
    ] as const) {
      const input = document.createElement("input");
      input.setAttribute("aria-label", label);
      input.value = value;
      input.setAttribute("style", "display: block; box-sizing: border-box; width: 160px; margin: 8px; font-size: 16px;");
      document.querySelector("main")?.prepend(input);
    }
  });
  const found = await narrowFields(page);
  expect(found.filter((f) => f.includes('"Cut"'))).toEqual([expect.stringMatching(/^the field "Cut" cuts \d+px off the value it holds$/)]);
  expect(found.filter((f) => f.includes('"Whole"'))).toEqual([]);
});

// A scroll region names itself a region, and joins the Tab order, in a ResizeObserver's callback and the commit after
// it. The sweep waits for that settled state (layout.ts), however late it comes: here the observer is held back 150ms.
test("the sweep reads a scroll region only once it has announced itself, however late", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the sweep reads tap targets, a touch screen's");
  await page.addInitScript(() => {
    const Real = window.ResizeObserver;
    window.ResizeObserver = class extends Real {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => setTimeout(() => callback(entries, observer), 150));
      }
    };
  });
  await text200(page);
  await page.setViewportSize({ width: 640, height: 844 });
  await gotoReady(page, `/pnr#${PNR.mixed}`);
  await expect(page.locator('[data-scroll-region="passengers"]')).toBeVisible({ timeout: 30_000 });
  expect(await breaksAt200(page)).toEqual([]);
  await expect(page.locator('[data-scroll-region="passengers"]'), "the table is wider than its plate here: the case this test is about").toHaveAttribute("data-scrolls", "yes");
});

test("the passengers' scroll region is a landmark with a name of its own, not the plate's", async ({ page, isMobile }) => {
  test.skip(!isMobile, "once is enough");
  await text200(page);
  await page.setViewportSize({ width: 640, height: 844 });
  await gotoReady(page, `/pnr#${PNR.mixed}`);
  await expect(page.locator('[data-scroll-region="passengers"]')).toHaveAttribute("data-scrolls", "yes", { timeout: 30_000 });
  const results = await axeResults(page);
  expect(results.violations.filter((v) => v.id === "landmark-unique").map((v) => v.nodes.map((n) => n.target.join(" ")))).toEqual([]);
});

// The landing's in-place record (decided 2026-10-04, the owner). At 100% it is the table it always was wherever the
// window shows all of it: four columns that cannot wrap below 309.1px for the fixture's party of three, starting 42px
// into the page, so from a 352px window up (to 393px the table overhangs its frame, as drawn; from 394px the frame holds
// it). In a narrower window the page cut its last column off; there each passenger now stacks into the labelled rows
// the record already used with larger text: every cell inside the frame, nothing cut, no scroller, no Tab stop of its
// own. With the text at 200% the rows stack at every one of these widths, as before. The switch measures the table
// itself (use-outgrown.ts): the widths here are this fixture's, not the code's.
for (const width of [280, 300, 320, 340, 351, 352, 360, 375, 390] as const) {
  test(`at ${width}px the landing's record is ${width < 352 ? "stacked rows" : "a plain table"} at 100%, and stacked rows at 200%`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "a phone's widths");
    const record = async () => {
      await page.setViewportSize({ width, height: 844 });
      await gotoReady(page, "/");
      await waitForJourney(page);
      await page.getByLabel("PNR number").first().fill(PNR.mixed);
      await page.getByRole("button", { name: "Run", exact: true }).first().click();
      const result = page.getByTestId("terminal-result");
      await expect(result.locator("table")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('[style*="height"]:has([data-testid="terminal-result"])')).toHaveCount(0, { timeout: 10_000 });
      return result.evaluate((el) => {
        const table = el.querySelector("table");
        if (!table) throw new Error("no table");
        const frame = (table.parentElement as HTMLElement).getBoundingClientRect();
        const cells = [...table.querySelectorAll<HTMLElement>("tbody td")];
        const px = (n: number) => Math.round(n * 10) / 10;
        return {
          rows: [...new Set([...table.querySelectorAll("tbody tr")].map((r) => getComputedStyle(r).display))],
          scrollers: el.querySelectorAll('[data-scroll-region], [role="region"], [tabindex="0"]').length,
          stops: [...el.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")].filter((stop) => stop.tabIndex >= 0).length,
          table: Math.round(table.getBoundingClientRect().width),
          box: Math.round(frame.width),
          cells: cells.length,
          // a cell a reader cannot see all of: empty, past the window's side, or (stacked) outside the record's frame
          pastWindow: cells.flatMap((cell) => {
            const box = cell.getBoundingClientRect();
            return box.width > 0 && box.left >= 0 && box.right <= document.documentElement.clientWidth ? [] : [`"${cell.textContent}" [${px(box.left)}, ${px(box.right)}]`];
          }),
          pastFrame: cells.flatMap((cell) => {
            const box = cell.getBoundingClientRect();
            return box.left >= frame.left - 0.5 && box.right <= frame.right + 0.5 ? [] : [`"${cell.textContent}" [${px(box.left)}, ${px(box.right)}] in [${px(frame.left)}, ${px(frame.right)}]`];
          }),
          // stacked, a cell says which column it was: the column's heading, drawn above it
          labels: cells.map((cell) => (cell.dataset.label ? getComputedStyle(cell, "::before").content : "")).filter((label) => label !== "" && label !== "none").length,
          empty: cells.filter((cell) => (cell.textContent ?? "").trim() === "").length,
        };
      });
    };
    const drawn = await record();
    expect(drawn.cells, "a party of three, four cells a passenger").toBe(12);
    expect(drawn.empty, "every cell says something").toBe(0);
    expect(drawn.scrollers, "no scroller, no region, no Tab stop at 100%").toBe(0);
    expect(drawn.stops, "the record's two controls, and no Tab stop besides").toBe(2);
    expect(drawn.pastWindow, "every cell wholly inside the window at 100%").toEqual([]);
    if (width < 352) {
      expect(drawn.rows, "at 100% in a window the table would run out of, the rows stack").toEqual(["grid"]);
      expect(drawn.table, "and the stacked table is no wider than its frame").toBeLessThanOrEqual(drawn.box);
      expect(drawn.pastFrame, "every cell inside the record's frame").toEqual([]);
      expect(drawn.labels, "booked, current and coach · berth, labelled for each passenger").toBe(9);
    } else {
      expect(drawn.rows, "at 100% where the window shows all of it, the table as drawn").toEqual(["table-row"]);
    }
    expect(await layoutBreaks(page), "at 100%").toEqual([]);
    expect(await cutText(page, '[data-testid="terminal-result"]'), "no word of the record cut at 100%").toEqual([]);
    await text200(page);
    const large = await record();
    expect(large.scrollers, "no scroller at 200% either").toBe(0);
    expect(large.stops, "nor a Tab stop").toBe(2);
    expect(large.rows, "at 200% the rows stack").toEqual(["grid"]);
    expect(large.table, "and the table is no wider than its frame").toBeLessThanOrEqual(large.box);
    expect(large.labels).toBe(9);
    expect(await layoutBreaks(page), "at 200%").toEqual([]);
  });
}

// The same record in a window that changes width under it (a phone turned, a window dragged): it stacks as the window
// stops showing the whole table and is the table again as soon as the window would, from what the table needed when it
// was last a table. Each state is waited for, never timed.
test("the landing's record stacks and is a table again as its window narrows and widens", async ({ page, isMobile }) => {
  test.skip(!isMobile, "a phone's widths");
  await gotoReady(page, "/");
  await waitForJourney(page);
  await page.getByLabel("PNR number").first().fill(PNR.mixed);
  await page.getByRole("button", { name: "Run", exact: true }).first().click();
  const row = page.getByTestId("terminal-result").locator("tbody tr").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  for (const [width, display] of [
    [390, "table-row"],
    [320, "grid"],
    [352, "table-row"],
    [351, "grid"],
    [768, "table-row"],
    [280, "grid"],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    await expect(row, `${width}px`).toHaveCSS("display", display);
  }
  await expect(page.locator('[style*="height"]:has([data-testid="terminal-result"])')).toHaveCount(0, { timeout: 10_000 });
  expect(await layoutBreaks(page), "at 280px, after the changes").toEqual([]);
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
