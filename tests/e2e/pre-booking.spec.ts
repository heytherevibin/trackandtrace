import { expect, test } from "./fixtures";
import { gotoReady } from "./helpers";

// Form TL-02 v2 as the sheet draws it: stations, a date and the classes you would travel in, then
// every train on that route with the first of those classes answered.
//
// The assertion that matters most is the one about what is NOT shown. A journey the source cannot
// answer must never render an empty list, because a traveller reads that as "no berths" — and the
// same is true of a pair that has no trains, which is a different fact and gets its own sentence.

async function pickRoute(page: import("@playwright/test").Page, from: string, to: string): Promise<void> {
  await page.getByLabel("From", { exact: true }).fill(from);
  await page.getByLabel("To", { exact: true }).fill(to);
  await page.getByLabel("To", { exact: true }).blur();
}

async function search(page: import("@playwright/test").Page, date = "2026-10-15"): Promise<void> {
  await page.getByLabel("Journey date").fill(date);
  await page.getByRole("button", { name: "Find trains" }).click();
}

test("opens with three classes chosen and nothing asked", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  for (const cls of ["SL", "3A", "2A"]) {
    await expect(page.getByRole("button", { name: cls, exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.getByRole("button", { name: "1A", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: "Find trains" })).toBeDisabled();
});

test("lists every train on the route, each carrying one class", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  await pickRoute(page, "SBC", "NDLS");
  await search(page);

  const rows = page.getByTestId("train-row");
  await expect(rows.first()).toBeVisible();
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);
  // Every chosen class is answered for every train, so nothing is left "not asked yet" — and the
  // sample Rajdhani carries no sleeper, which the page says rather than leaving the class out.
  await expect(page.getByText(/not asked yet/)).toHaveCount(0);
  await expect(page.getByText("Not carried").first()).toBeVisible();
  // And the sample special is closed for booking, which the page says in its own words. "Could not
  // answer" would be the opposite claim: one means try again, this means pick another date.
  await expect(page.getByText("This train cannot be booked for this date.")).toBeVisible();
  await expect(page.getByText(/could not answer for this train/i)).toHaveCount(0);
});

test("says which class the list leads with, so the column is not arbitrary", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  // 2A leads out of SL/3A/2A because the enum declares it first — not because of click order.
  await expect(page.getByText("2A first")).toBeVisible();
});

test("will not let the last class be turned off", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  for (const cls of ["3A", "2A"]) await page.getByRole("button", { name: cls, exact: true }).click();
  await expect(page.getByRole("button", { name: "SL", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "SL", exact: true }).click();
  // No class is not a question anyone can answer.
  await expect(page.getByRole("button", { name: "SL", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("a pair with no trains says so, and is never searched", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  await pickRoute(page, "SBC", "XXXX");

  // Said twice on purpose: once under the field that is wrong, once as the lifecycle stop that failed.
  await expect(page.getByText(/No trains run SBC/i)).toHaveCount(2);
  await expect(page.getByLabel("Journey date")).toBeVisible();
  await page.getByLabel("Journey date").fill("2026-10-15");
  // Searching would spend a request to learn what the railway already answered for free.
  await expect(page.getByRole("button", { name: "Find trains" })).toBeDisabled();
  await expect(page.getByTestId("train-row")).toHaveCount(0);
});

test("a search the source cannot answer shows a refusal, never an empty list", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  await page.route("**/api/route-availability", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, code: "SOURCE_UNAVAILABLE", message: "The reservation service could not answer for this journey. Nothing was shown in its place." }),
    }),
  );
  await pickRoute(page, "SBC", "NDLS");
  await search(page);

  await expect(page.getByText("The reservation service could not answer for this journey.")).toBeVisible();
  await expect(page.getByTestId("train-row")).toHaveCount(0);
});

test("a past date is refused before anything is spent", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  await pickRoute(page, "SBC", "NDLS");
  await page.getByLabel("Journey date").fill("2020-01-01");
  await expect(page.getByText("Pick today or a later date.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Find trains" })).toBeDisabled();
});

test("the lifecycle marks the route resolved and the search done", async ({ page }) => {
  await gotoReady(page, "/pre-booking");
  const lifecycle = page.getByRole("list", { name: /lifecycle/i });
  await expect(lifecycle.getByRole("listitem")).toHaveCount(4);

  await pickRoute(page, "SBC", "NDLS");
  await search(page);

  await expect(lifecycle.getByRole("listitem").nth(1)).toHaveAttribute("data-state", "done");
  await expect(lifecycle.getByRole("listitem").nth(2)).toHaveAttribute("data-state", "done");
});

test("the chart's column names fit their own cells once the rows stack", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the stacked layout only exists below sm");
  await gotoReady(page, "/pre-booking");
  await pickRoute(page, "SBC", "NDLS");
  await search(page);
  await page
    .getByRole("button", { name: /More classes and dates|Three more dates/ })
    .first()
    .click();
  await expect(page.getByRole("table", { name: "Availability" }).first()).toBeVisible();

  // Below sm each row becomes a labelled record and the column name is drawn from `data-label` as
  // generated text. Those cells are `overflow: visible`, so a name too wide for its cell is not
  // hidden — it is painted across the neighbouring column, and the two names read as one
  // run-together word. That is why `layoutBreaks` does not catch this: it looks for content a box
  // HIDES, and nothing here is hidden.
  const spill = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("td[data-label]")]
      .filter((td) => td.scrollWidth > td.clientWidth + 1)
      .map((td) => `"${td.dataset.label}" needs ${td.scrollWidth}px of a ${td.clientWidth}px cell`),
  );
  expect(spill, spill.join("\n")).toEqual([]);
});

test("the chart's values start on one line when the rows stack", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the stacked layout only exists below sm");
  await gotoReady(page, "/pre-booking");
  await pickRoute(page, "SBC", "NDLS");
  await search(page);
  await page
    .getByRole("button", { name: /More classes and dates|Three more dates/ })
    .first()
    .click();
  await expect(page.getByRole("table", { name: "Availability" }).first()).toBeVisible();

  // Two cells side by side in a record each draw their own name above their own value, and a name
  // that takes two lines pushes its value a line below its neighbour's. The reader then sees two
  // figures on different lines with no rule saying which belongs to which name.
  //
  // A Range over a cell's child nodes measures the VALUE: generated content is not in the DOM, so
  // the ::before name is left out of the box it reports.
  const drift = await page.evaluate(() => {
    const out: string[] = [];
    for (const row of document.querySelectorAll<HTMLElement>("tr")) {
      const bands = new Map<number, { label: string; top: number }[]>();
      for (const td of row.querySelectorAll<HTMLElement>("td[data-label]")) {
        const box = td.getBoundingClientRect();
        if (box.width === 0) continue;
        const range = document.createRange();
        range.selectNodeContents(td);
        const band = [...bands.keys()].find((k) => Math.abs(k - box.top) < 4) ?? Math.round(box.top);
        bands.set(band, [...(bands.get(band) ?? []), { label: td.dataset.label ?? "", top: Math.round(range.getBoundingClientRect().top) }]);
      }
      for (const group of bands.values()) {
        if (group.length < 2) continue;
        const tops = group.map((g) => g.top);
        const apart = Math.max(...tops) - Math.min(...tops);
        if (apart > 1) out.push(`${apart}px apart: ${group.map((g) => `${g.label}@${g.top}`).join(" | ")}`);
      }
    }
    return [...new Set(out)];
  });
  expect(drift, drift.join("\n")).toEqual([]);
});

// The calendar opens under the date field, from the field's left edge, seven day cells wide. On a phone under 382px
// that ran past the window's right side (101px at 280, 61px at 320, 21px at 360): the Saturday column was half off.
// It now stays inside the window: moved left when there is no room to its right, its day cells sharing the window's
// width where seven 44px cells cannot fit it (under 352px). Where it always fitted, it is where it always was.
for (const width of [280, 320, 360, 390] as const) {
  test(`the calendar stays inside a ${width}px window, every day of the week in view`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "a phone's widths");
    await page.setViewportSize({ width, height: 844 });
    await gotoReady(page, "/pre-booking");
    await page.getByRole("button", { name: "Choose a date" }).click();
    const calendar = page.getByRole("dialog");
    await expect(calendar).toBeVisible();
    const at = await calendar.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const days = [...el.querySelectorAll("button[aria-label]")].map((d) => d.getBoundingClientRect());
      const field = el.parentElement?.querySelector("input")?.getBoundingClientRect();
      return {
        vw: document.documentElement.clientWidth,
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        left: Math.round(box.left),
        right: Math.round(box.right),
        field: Math.round(field?.left ?? -1),
        dayRight: Math.round(Math.max(...days.map((d) => d.right))),
        dayWidth: Math.round(Math.min(...days.map((d) => d.width))),
        dayHeight: Math.round(Math.min(...days.map((d) => d.height))),
      };
    });
    expect(at.left, JSON.stringify(at)).toBeGreaterThanOrEqual(0);
    expect(at.right, JSON.stringify(at)).toBeLessThanOrEqual(at.vw);
    expect(at.dayRight, "the Saturday column").toBeLessThanOrEqual(at.vw);
    expect(at.sideways, "the page does not scroll sideways for it").toBe(0);
    expect(at.dayHeight).toBeGreaterThanOrEqual(44);
    // seven 44px cells where the window holds them; under that, an equal share of it, never under 32px
    expect(at.dayWidth).toBeGreaterThanOrEqual(width >= 352 ? 44 : 32);
    // where it fitted before, it has not moved: under the field, from the field's left edge
    if (width >= 390) expect(at.left).toBe(at.field);
  });
}
