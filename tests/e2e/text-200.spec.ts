import type { Page } from "@playwright/test";
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

// The landing's in-place record (decided 2026-10-04 and 2026-10-05, the owner): it is the four-column table only where
// its frame holds the table, at any text size, and everywhere else each passenger stacks into labelled rows: every cell
// inside the frame, nothing cut, no scroller, no Tab stop of its own. The table cannot wrap below its own least width
// (309.1px at 100% for the fixture's party of three) and its frame is the window less the page's and the plate's
// margins (84px on a phone), so as drawn it stacks in every window under 394px: every phone. The switch measures the
// table itself (use-outgrown.ts), so these tests do too: what is asserted is "stacked exactly where the table is wider
// than its frame", from the table's own least width, and the named widths only say which side each is expected on.

/** The record in the landing's check plate, a party of three, its plate's morph over. */
async function openRecord(page: Page, width: number, height = 844): Promise<void> {
  await page.setViewportSize({ width, height });
  await gotoReady(page, "/");
  await waitForJourney(page);
  await page.getByLabel("PNR number").first().fill(PNR.mixed);
  await page.getByRole("button", { name: "Run", exact: true }).first().click();
  await expect(page.getByTestId("terminal-result").locator("table")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[style*="height"]:has([data-testid="terminal-result"])')).toHaveCount(0, { timeout: 10_000 });
}

/** The record as it stands: how its rows are laid out, what its frame holds, and every cell a reader cannot see all of. */
async function readRecord(page: Page) {
  return page.getByTestId("terminal-result").evaluate((el) => {
    const table = el.querySelector("table");
    if (!table) throw new Error("no table");
    const box = table.parentElement as HTMLElement;
    const frame = box.getBoundingClientRect();
    const style = getComputedStyle(box);
    const cells = [...table.querySelectorAll<HTMLElement>("tbody td")];
    const px = (n: number) => Math.round(n * 10) / 10;
    return {
      rows: [...new Set([...table.querySelectorAll("tbody tr")].map((r) => getComputedStyle(r).display))],
      scrollers: el.querySelectorAll('[data-scroll-region], [role="region"], [tabindex="0"]').length,
      stops: [...el.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")].filter((stop) => stop.tabIndex >= 0).length,
      table: table.getBoundingClientRect().width,
      /** The width inside the frame's hairlines, in fractions of a pixel. */
      holds: frame.width - Number.parseFloat(style.borderLeftWidth) - Number.parseFloat(style.borderRightWidth),
      cells: cells.length,
      pastWindow: cells.flatMap((cell) => {
        const at = cell.getBoundingClientRect();
        return at.width > 0 && at.left >= 0 && at.right <= document.documentElement.clientWidth ? [] : [`"${cell.textContent}" [${px(at.left)}, ${px(at.right)}]`];
      }),
      pastFrame: cells.flatMap((cell) => {
        const at = cell.getBoundingClientRect();
        return at.left >= frame.left - 0.5 && at.right <= frame.right + 0.5 ? [] : [`"${cell.textContent}" [${px(at.left)}, ${px(at.right)}] in [${px(frame.left)}, ${px(frame.right)}]`];
      }),
      // stacked, a cell says which column it was: the column's heading, drawn above it
      labels: cells.map((cell) => (cell.dataset.label ? getComputedStyle(cell, "::before").content : "")).filter((label) => label !== "" && label !== "none").length,
      empty: cells.filter((cell) => (cell.textContent ?? "").trim() === "").length,
    };
  });
}

/** What the table needs: its least width, asked of the table itself while it is a table (a table given no width at all
 * takes exactly the width it cannot wrap below). In a window wide enough to hold it, at the text size the page has. */
async function tableNeeds(page: Page): Promise<number> {
  await page.setViewportSize({ width: 1024, height: 844 });
  const row = page.getByTestId("terminal-result").locator("tbody tr").first();
  await expect(row, "a table in a 1024px window: the measure is of a table").toHaveCSS("display", "table-row");
  return page.getByTestId("terminal-result").evaluate((el) => {
    const table = el.querySelector("table") as HTMLTableElement;
    const was = table.style.width;
    table.style.width = "0";
    const needs = table.getBoundingClientRect().width;
    table.style.width = was;
    return needs;
  });
}

for (const [width, expected] of [
  [280, "grid"],
  [320, "grid"],
  [352, "grid"],
  [360, "grid"],
  [375, "grid"],
  [390, "grid"],
  [430, "table-row"],
  [768, "table-row"],
  [1440, "table-row"],
] as const) {
  test(`at ${width}px the landing's record is ${expected === "grid" ? "stacked rows" : "the table"} at 100%, by the table's own measure, and stacked rows at 200%`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "once, on the phone project, across the widths");
    await openRecord(page, width);
    const drawn = await readRecord(page);
    expect(drawn.cells, "a party of three, four cells a passenger").toBe(12);
    expect(drawn.empty, "every cell says something").toBe(0);
    expect(drawn.scrollers, "no scroller, no region, no Tab stop at 100%").toBe(0);
    expect(drawn.stops, "the record's two controls, and no Tab stop besides").toBe(2);
    expect(drawn.pastWindow, "every cell wholly inside the window at 100%").toEqual([]);
    expect(drawn.pastFrame, "and inside the record's frame: nothing crosses its border").toEqual([]);
    expect(drawn.table, "the table, stacked or not, is no wider than its frame").toBeLessThanOrEqual(drawn.holds + 0.02);
    expect(drawn.rows, `at 100% in a ${width}px window`).toEqual([expected]);
    if (expected === "grid") expect(drawn.labels, "booked, current and coach · berth, labelled for each passenger").toBe(9);
    expect(await layoutBreaks(page), "at 100%").toEqual([]);
    expect(await cutText(page, '[data-testid="terminal-result"]'), "no word of the record cut at 100%").toEqual([]);
    // and that is the table's own measure against its frame's, not this list's say-so
    const needs = await tableNeeds(page);
    expect(needs > drawn.holds + 0.02 ? "grid" : "table-row", `the table needs ${needs}px and its frame holds ${drawn.holds}px`).toBe(expected);

    await text200(page);
    await openRecord(page, width);
    const large = await readRecord(page);
    expect(large.scrollers, "no scroller at 200% either").toBe(0);
    expect(large.stops, "nor a Tab stop").toBe(2);
    expect(large.rows, "at 200% the rows stack").toEqual(["grid"]);
    expect(large.table, "and the table is no wider than its frame").toBeLessThanOrEqual(large.holds + 0.02);
    expect(large.labels).toBe(9);
    expect(await layoutBreaks(page), "at 200%").toEqual([]);
  });
}

// Where the one becomes the other is the table's to say. From its least width and the margins the page gives a phone's
// frame, the first window whose frame holds the table is worked out here (394px for the fixture's party of three), and
// the record must be the table there and stacked a pixel narrower: no width is written into the code or into this test.
test("the landing's record is a table from the first width its frame holds the table, and stacked one pixel narrower", async ({ page, isMobile }) => {
  test.skip(!isMobile, "a phone's widths");
  await openRecord(page, 390);
  const phone = await readRecord(page);
  const margins = 390 - phone.holds;
  const needs = await tableNeeds(page);
  const first = Math.ceil(needs + margins - 0.02);
  expect(first, `the table needs ${needs}px, the margins take ${margins}px: a width the phone sweep's margins still hold at`).toBeLessThanOrEqual(400);
  expect(first, "and the table is wider than a 390px phone's frame: the case this test is about").toBeGreaterThan(390);
  for (const [width, display] of [
    [first - 1, "grid"],
    [first, "table-row"],
  ] as const) {
    await openRecord(page, width);
    const at = await readRecord(page);
    expect(width - at.holds, `the margins at ${width}px are the phone's`).toBe(margins);
    expect(at.rows, `${width}px: its frame holds ${at.holds}px of the ${needs}px the table needs`).toEqual([display]);
    expect(at.pastFrame, `${width}px`).toEqual([]);
  }
});

// The same record in a window that changes width under it (a window dragged): it stacks as its frame stops holding the
// table and is the table again as soon as the frame would, from what the table needed when it was last a table. Each
// state is waited for, never timed.
test("the landing's record stacks and is a table again as its window narrows and widens", async ({ page, isMobile }) => {
  test.skip(!isMobile, "a phone's widths");
  await openRecord(page, 430);
  const row = page.getByTestId("terminal-result").locator("tbody tr").first();
  for (const [width, display] of [
    [430, "table-row"],
    [390, "grid"],
    [768, "table-row"],
    [352, "grid"],
    [1024, "table-row"],
    [280, "grid"],
  ] as const) {
    await page.setViewportSize({ width, height: 844 });
    await expect(row, `${width}px`).toHaveCSS("display", display);
  }
  await expect(page.locator('[style*="height"]:has([data-testid="terminal-result"])')).toHaveCount(0, { timeout: 10_000 });
  expect(await layoutBreaks(page), "at 280px, after the changes").toEqual([]);
});

// Stacked, the record's columns are the facts grid's above it (decided 2026-10-05, the owner): Booked under the first
// column and Current exactly under the second (Route, Class · quota), with Coach · berth on a row of its own beneath on
// every phone. The two grids are cut from the same two lengths (pnr-terminal-result.tsx), so they hold as many columns
// as each other at any width and text size. With this fixture the record never stacks where the frame holds three
// columns (the table needs 19.3rem and three columns 20.6rem): at 200% text it is two columns at 640, 768 and 1440,
// and one column, the facts grid's one, at 1024. The two grids turn from one column to two at the same pixel, a 220px
// frame: a 304px window has it and a 302px window is 2px short (a stacked track 2px narrower, 5rem for 5.125rem, would
// already stand two across there, beside a facts grid of one).
for (const [width, zoom, columns] of [
  [302, 100, 1],
  [304, 100, 2],
  [320, 100, 2],
  [360, 100, 2],
  [375, 100, 2],
  [390, 100, 2],
  [393, 100, 2],
  [640, 200, 2],
  [768, 200, 2],
  [1024, 200, 1],
  [1440, 200, 2],
] as const) {
  test(`at ${width}px at ${zoom}% text the stacked record's columns stand under the facts grid's: ${columns === 2 ? "Current under the second" : "one column, as the facts grid is"}`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "once, on the phone project, across the widths");
    if (zoom === 200) await text200(page);
    await openRecord(page, width);
    const at = await page.getByTestId("terminal-result").evaluate((el) => {
      const table = el.querySelector("table");
      const frame = table?.parentElement;
      if (!table || !frame) throw new Error("no table");
      const facts = [...frame.querySelectorAll("dl > div > dt")].map((dt) => ({ name: (dt.textContent ?? "").trim(), left: dt.getBoundingClientRect().left, top: dt.getBoundingClientRect().top }));
      // the facts grid's columns: where its first row's cells start
      const columns = facts.filter((fact) => Math.abs(fact.top - (facts[0]?.top ?? 0)) < 1);
      return {
        rows: [...new Set([...table.querySelectorAll("tbody tr")].map((r) => getComputedStyle(r).display))],
        columns,
        passengers: [...table.querySelectorAll("tbody tr")].map((row) =>
          [...row.querySelectorAll<HTMLElement>("td[data-label]")].map((cell) => ({ label: cell.dataset.label ?? "", left: cell.getBoundingClientRect().left, top: cell.getBoundingClientRect().top })),
        ),
      };
    });
    expect(at.rows, "the record is stacked: the case this test is about").toEqual(["grid"]);
    expect(at.columns.length, `the facts grid's columns (${at.columns.map((c) => c.name).join(", ")})`).toBe(columns);
    expect(at.passengers.length).toBe(3);
    for (const cells of at.passengers) {
      expect(cells.map((cell) => cell.label)).toEqual(["Booked", "Current", "Coach · berth"]);
      // each labelled cell in turn under the facts grid's columns in turn, to half a pixel
      for (const [k, cell] of cells.entries()) expect(Math.abs(cell.left - (at.columns[k % columns]?.left ?? Number.NaN)), `${cell.label} at ${cell.left}px, under ${at.columns[k % columns]?.name}`).toBeLessThanOrEqual(0.5);
      const [booked, current, berth] = cells;
      if (!booked || !current || !berth) throw new Error("a passenger without its three cells");
      if (columns === 2) {
        expect(at.columns[1]?.name, "the facts grid's second column").toBe("Route");
        expect(Math.abs(current.top - booked.top), "Booked and Current side by side").toBeLessThan(1);
        expect(berth.top, "Coach · berth on a row of its own beneath").toBeGreaterThan(booked.top + 1);
      }
    }
  });
}

// A phone turned on its side and back, the record open. The switch reads only the record's frame, never the window
// (use-outgrown.ts): a turn changes the frame's width, its ResizeObserver reports it, and the record is the table in
// the 844px window and stacked again in the 390px one, whichever way it started.
for (const [name, first, turned] of [
  ["upright, turned on its side and back", { width: 390, height: 844 }, { width: 844, height: 390 }],
  ["on its side, turned upright and back", { width: 844, height: 390 }, { width: 390, height: 844 }],
] as const) {
  test(`a phone ${name}: the landing's record is stacked upright and the table on its side`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "a phone");
    await openRecord(page, first.width, first.height);
    const row = page.getByTestId("terminal-result").locator("tbody tr").first();
    for (const size of [first, turned, first, turned]) {
      await page.setViewportSize(size);
      await expect(row, `${size.width}×${size.height}`).toHaveCSS("display", size.width < size.height ? "grid" : "table-row");
      const at = await readRecord(page);
      expect(at.pastFrame, `${size.width}×${size.height}: every cell inside the record's frame`).toEqual([]);
      expect(at.pastWindow, `${size.width}×${size.height}`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), "no sideways scroll").toBeLessThanOrEqual(0);
    }
  });
}

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
