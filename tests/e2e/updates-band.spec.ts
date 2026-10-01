import type { Page } from "@playwright/test";
import { messages } from "@/messages";
import { expect, test } from "./fixtures";
import { PNR, axeResults, gotoReady, holdJourney } from "./helpers";
import { brokenWords, cutText, layoutBreaks } from "./layout";
import { UNSUBSCRIBE } from "./subscribe-link";

// The "Updates by email" band (the owner, 2026-10-01): the sign-up left the footer and stands between the page and
// the footer, full on the landing, slim on the app pages, absent where a page asks for an address of its own or is
// about leaving a list. Every traveller page now ends on the same full footer, which carries no form.
const m = messages.subscribe;
const SHOWN = [
  ["/", "full"],
  ["/pnr", "slim"],
  [`/pnr#${PNR.mixed}`, "slim"],
  ["/watchlist", "slim"],
  ["/account", "slim"],
  ["/accuracy", "slim"],
  ["/privacy", "slim"],
  ["/tos", "slim"],
] as const;
const HIDDEN = ["/subscribe/confirm", "/unsubscribe", UNSUBSCRIBE.valid, "/login", "/pre-booking", "/offline"] as const;

const band = (page: Page) => page.getByRole("region", { name: m.places.footerColumn });
const footer = (page: Page) => page.getByRole("contentinfo");

/** The full footer, as every traveller page draws it: four columns, the bar, and no form. */
async function expectFullFooter(page: Page, path: string): Promise<void> {
  const foot = footer(page);
  await expect(foot.locator("[data-footer-column]"), `${path}: four columns`).toHaveCount(4);
  await expect(foot.getByText(messages.common.footerDisclaimer)).toBeVisible();
  for (const name of [messages.shell.footer.sections, messages.shell.footer.product, messages.shell.footer.company]) {
    await expect(foot.getByText(name, { exact: true }).first(), `${path}: ${name}`).toBeVisible();
  }
  await expect(foot.getByRole("list", { name: messages.shell.footer.sections }).getByRole("link")).toHaveCount(4);
  await expect(foot.getByRole("switch", { name: messages.shell.footer.motion })).toBeVisible();
  await expect(foot.locator("form"), `${path}: no form in the footer`).toHaveCount(0);
  await expect(foot.locator("input[name='email'], input[type='email']"), `${path}: no email field in the footer`).toHaveCount(0);
}

for (const [path, variant] of SHOWN) {
  test(`${path} carries the ${variant} band between the page and the full footer`, async ({ page }) => {
    await gotoReady(page, path);
    const section = band(page);
    await expect(section).toHaveCount(1);
    await expect(section).toHaveAttribute("data-variant", variant);
    await expect(section.getByRole("heading", { level: 2, name: m.places.footerColumn })).toBeVisible();
    await expect(section.getByText(m.promise.news)).toBeVisible();
    await expect(section.getByLabel(m.form.label, { exact: true })).toBeVisible();
    await expect(section.getByRole("button", { name: m.form.subscribe })).toBeVisible();
    await expect(section.getByRole("link", { name: m.form.consent.link })).toHaveAttribute("href", "/privacy");
    // A <section> between <main> and <footer>, in the shell: never inside either.
    expect(await section.evaluate((el) => [el.tagName, el.previousElementSibling?.tagName, el.nextElementSibling?.tagName])).toEqual(["SECTION", "MAIN", "FOOTER"]);
    // One form on the page answers to this name.
    await expect(page.getByRole("form", { name: m.places.footerColumn })).toHaveCount(1);
    await expectFullFooter(page, path);
  });
}

for (const path of HIDDEN) {
  test(`${path} has no band, and the same full footer`, async ({ page }) => {
    await gotoReady(page, path);
    await expect(band(page)).toHaveCount(0);
    await expect(page.locator("#updates")).toHaveCount(0);
    await expect(page.getByRole("form", { name: m.places.footerColumn })).toHaveCount(0);
    await expectFullFooter(page, path);
  });
}

// The legal pages used to close on a line of their own, "Not affiliated with IRCTC or Indian Railways.", under a
// hairline. With the full footer on every page that line stood a screen above the footer's own disclaimer, so it was
// dropped (the owner, 2026-10-01): the page ends on its last section, and the footer says it once.
for (const path of ["/privacy", "/tos"] as const) {
  test(`${path} does not repeat the disclaimer: the footer says it, the page does not`, async ({ page }) => {
    await gotoReady(page, path);
    const main = page.getByRole("main");
    await expect(main.getByText("Not affiliated with IRCTC or Indian Railways.", { exact: true })).toHaveCount(0);
    await expect(footer(page).getByText(messages.common.footerDisclaimer)).toBeVisible();
    // The article ends on its last section, and the band's rule is the next line down the page: no rule of the
    // page's own between them.
    const end = await page.evaluate(() => {
      const article = document.querySelector("main article");
      const last = article?.lastElementChild;
      const rule = document.querySelector("#updates hr");
      if (!article || !last || !rule) throw new Error("the page's end is not drawn");
      return { lastTag: last.tagName, gap: Math.round(rule.getBoundingClientRect().top - article.getBoundingClientRect().bottom) };
    });
    expect(end.lastTag).toBe("SECTION");
    // page-body's 5rem run-out, and nothing else, between the last words and the band's rule (the index plate can be
    // the taller column on a wide screen, so at least).
    expect(end.gap).toBeGreaterThanOrEqual(80);
  });
}

test("on the landing the band stands between the terminus and the footer, at the sheet's width", async ({ page }) => {
  await gotoReady(page, "/");
  const boxes = await page.evaluate(() => {
    const box = (el: Element | null) => {
      if (!el) throw new Error("a piece of the page's end is missing");
      const r = el.getBoundingClientRect();
      return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, left: r.left, right: r.right };
    };
    return {
      terminus: box(document.getElementById("terminus")),
      band: box(document.getElementById("updates")),
      rule: box(document.querySelector("#updates hr")),
      plate: box(document.querySelector("#terminus .blueprint")),
      footer: box(document.querySelector("footer")),
      docEnd: document.documentElement.scrollHeight,
    };
  });
  expect(boxes.band.top, "under the terminus").toBeGreaterThanOrEqual(boxes.terminus.bottom - 1);
  expect(boxes.footer.top, "over the footer").toBeGreaterThanOrEqual(boxes.band.bottom - 1);
  expect(Math.round(boxes.footer.bottom), "the footer ends the page").toBe(boxes.docEnd);
  // Its hairline is the sheet's width, the closing plate's: not the footer's full-bleed rule.
  expect(Math.round(boxes.rule.left)).toBe(Math.round(boxes.plate.left));
  expect(Math.round(boxes.rule.right)).toBe(Math.round(boxes.plate.right));
});

test("the band is not a station: it is in no list of the landing's sections", async ({ page }) => {
  await gotoReady(page, "/");
  await expect(page.locator('a[href$="#updates"]')).toHaveCount(0);
  const sections = footer(page).getByRole("list", { name: messages.shell.footer.sections }).getByRole("link");
  expect(await sections.evaluateAll((links) => links.map((a) => a.getAttribute("href")))).toEqual(["#how", "#record", "#roadmap", "#faq"]);
});

test("from another page the footer's Sections lead to the landing's section", async ({ page }) => {
  await gotoReady(page, "/watchlist");
  const sections = footer(page).getByRole("list", { name: messages.shell.footer.sections }).getByRole("link");
  expect(await sections.evaluateAll((links) => links.map((a) => a.getAttribute("href")))).toEqual(["/#how", "/#record", "/#roadmap", "/#faq"]);
  await sections.filter({ hasText: "FAQ" }).click();
  await page.waitForURL(/\/#faq$/);
  await expect(page.locator("#faq")).toBeInViewport();
});

test("the Sound switch shows only on the landing, where the journey can sound", async ({ page }) => {
  await gotoReady(page, "/");
  await expect(page.locator("html")).toHaveAttribute("data-journey", "on", { timeout: 15_000 });
  await expect(footer(page).getByRole("switch", { name: messages.shell.footer.sound })).toBeVisible();
  await gotoReady(page, "/watchlist");
  await expect(footer(page).getByRole("switch", { name: messages.shell.footer.motion })).toBeVisible();
  await expect(footer(page).getByRole("switch", { name: messages.shell.footer.sound })).toBeHidden();
});

test("a slim band's sign-up says to check the inbox, and is recorded as the footer's", async ({ page }) => {
  const sent: unknown[] = [];
  await page.route("**/api/subscribe", (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, json: { ok: true, message: m.sent } });
  });
  await gotoReady(page, "/watchlist");
  await band(page).getByLabel(m.form.label, { exact: true }).fill("asha@example.in");
  await band(page).getByRole("button", { name: m.form.subscribe }).click();
  await expect(band(page).getByRole("status")).toHaveText(m.sent);
  // The consent line outlives the form.
  await expect(band(page).getByRole("link", { name: m.form.consent.link })).toBeVisible();
  expect(sent).toEqual([{ email: "asha@example.in", list: "news", source: "footer" }]);
});

test("a mistyped address is refused in the band without asking the server", async ({ page }) => {
  let asked = 0;
  await page.route("**/api/subscribe", (route) => {
    asked += 1;
    return route.abort();
  });
  await gotoReady(page, "/privacy");
  await band(page).getByLabel(m.form.label, { exact: true }).fill("nope");
  await band(page).getByRole("button", { name: m.form.subscribe }).click();
  await expect(band(page).getByRole("alert")).toHaveText(m.errors.invalid);
  await expect(band(page).getByLabel(m.form.label, { exact: true })).toHaveAttribute("aria-invalid", "true");
  expect(asked).toBe(0);
});

test.describe("heading order", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const path of ["/", "/pnr", "/watchlist", "/account", "/accuracy", "/privacy", "/tos"] as const) {
      test(`${path} keeps its heading order with the band's h2, ${theme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: theme });
        await page.addInitScript((t) => window.localStorage.setItem("tt.theme", t), theme);
        await gotoReady(page, path);
        await expect(band(page)).toBeVisible();
        const results = await axeResults(page);
        // Every severity: heading-order is "moderate", which expectAxeClean lets through.
        const about = results.violations.filter((v) => ["heading-order", "landmark-unique", "region", "page-has-heading-one", "empty-heading", "label", "form-field-multiple-labels"].includes(v.id));
        expect(about.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      });
    }
  }
});

test.describe("the band fits", () => {
  test.skip(({ isMobile }) => isMobile, "each test sets its own window");

  /** Text at 200%, from before the page's first paint, as the nightly sets it. */
  const text200 = (page: Page) => page.addInitScript(() => document.addEventListener("DOMContentLoaded", () => document.documentElement.style.setProperty("font-size", "200%")));

  /** Anything of the band, or of the footer under it, that runs past either side of the window. */
  const pastTheWindow = (page: Page) =>
    page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      return [...document.querySelectorAll("#updates *, footer *")]
        .filter((el) => (el as HTMLElement).checkVisibility?.() !== false)
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > vw + 1 || r.left < -1);
        })
        .map((el) => `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}" spans ${Math.round(el.getBoundingClientRect().left)}–${Math.round(el.getBoundingClientRect().right)} in a ${vw}px window`);
    });

  /**
   * The field keeps a usable width, the button is whole, and the consent line sits under the field. The floor is the
   * form's own, 7.5rem, so it follows the text's size (120px at 100%, 240px at 200%); where the band's column is
   * narrower than that, the field has the whole column. A button that no longer fits beside such a field goes under
   * it, the column wide.
   */
  async function expectFormWhole(page: Page, label: string): Promise<void> {
    const section = page.locator("#updates");
    const [field, button, consent, frame, form] = await Promise.all([
      section.locator("input[name='email']").boundingBox(),
      section.getByRole("button", { name: m.form.subscribe }).boundingBox(),
      section.locator("p", { has: page.locator("a[href='/privacy']") }).boundingBox(),
      section.boundingBox(),
      section.locator("form").boundingBox(),
    ]);
    if (!field || !button || !consent || !frame || !form) throw new Error(`${label}: the band's form is not drawn`);
    const { vw, rem } = await page.evaluate(() => ({ vw: document.documentElement.clientWidth, rem: Number.parseFloat(getComputedStyle(document.documentElement).fontSize) }));
    const floor = Math.min(7.5 * rem, form.width) - 1;
    const measured = `field ${Math.round(field.width)}px, button ${Math.round(button.width)}px at y ${Math.round(button.y)}, form ${Math.round(form.width)}px, 1rem = ${rem}px`;
    expect(field.width, `${label}: the field is under its floor (${Math.round(floor)}px): ${measured}`).toBeGreaterThanOrEqual(floor);
    // Half a pixel of grace on the 44px floors: a box read while the band is mid-rise on the landing comes back as
    // 43.99997 (a transformed box's own arithmetic), which is 44 drawn.
    expect(field.height, `${label}: the field's height`).toBeGreaterThanOrEqual(43.5);
    expect(button.height, `${label}: the button's height`).toBeGreaterThanOrEqual(43.5);
    expect(button.x, `${label}: the button starts inside the window`).toBeGreaterThanOrEqual(0);
    expect(button.x + button.width, `${label}: the button ends inside the window`).toBeLessThanOrEqual(vw);
    const wrapped = button.y >= field.y + field.height - 1;
    if (wrapped) {
      expect(Math.round(field.width), `${label}: a field with the row to itself is the column wide: ${measured}`).toBe(Math.round(form.width));
      expect(Math.round(button.width), `${label}: a button under the field is the column wide: ${measured}`).toBe(Math.round(form.width));
    } else {
      expect(Math.abs(button.y + button.height - (field.y + field.height)), `${label}: the button stands on the field's line: ${measured}`).toBeLessThanOrEqual(1);
    }
    expect(consent.y, `${label}: the consent line is under the field and the button`).toBeGreaterThanOrEqual(Math.max(field.y + field.height, button.y + button.height));
    expect(consent.y + consent.height, `${label}: the consent line is inside the band`).toBeLessThanOrEqual(frame.y + frame.height + 1);
  }

  for (const width of [280, 320, 360, 390, 768, 1024, 1440] as const) {
    for (const path of ["/", "/accuracy"] as const) {
      test(`${path} at ${width}px: nothing of the band breaks the layout, is cut or runs past the window`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        // The still page: a started journey's run reads as hidden content to layoutBreaks (helpers.ts), and the band
        // read mid-rise gives sub-pixel boxes. The floors below take half a pixel either way, so they do not lean on
        // this hold alone. Once the route sweep waits for the journey and measures with the run pinned (PR #110), this
        // should do the same, and wait for the band's rise to finish, instead of holding the journey off.
        await holdJourney(page);
        await gotoReady(page, path);
        await page.locator("#updates").scrollIntoViewIfNeeded();
        // layoutBreaks is the phone sweep's (responsive.spec.ts): above its widths the landing's hero dial is clipped by
        // <main> on purpose, which it reports. The band's own boxes are measured at every width.
        if (width <= 768) expect(await layoutBreaks(page), "layout").toEqual([]);
        expect(await pastTheWindow(page), "past the window's side").toEqual([]);
        expect(await cutText(page, "#updates"), "cut text").toEqual([]);
        expect(await brokenWords(page, "#updates h2"), "a heading's word broken").toEqual([]);
        await expectFormWhole(page, `${path} at ${width}px`);
      });
    }
  }

  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [390, 844],
    [280, 653],
  ] as const) {
    for (const path of ["/", "/watchlist"] as const) {
      test(`${path} at ${width}×${height} with its text at 200%: every word of the band can be read`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await text200(page);
        await gotoReady(page, path);
        await page.locator("#updates").scrollIntoViewIfNeeded();
        expect(await cutText(page, "#updates"), "cut text").toEqual([]);
        expect(await brokenWords(page, "#updates h2"), "a heading's word broken").toEqual([]);
        expect(await pastTheWindow(page), "past the window's side").toEqual([]);
        await expectFormWhole(page, `${path} at ${width}×${height}, text at 200%`);
      });
    }
  }

  // A window between the phone's and the desk's: the footer's columns wrap. The brand may take a row of its own; the
  // three link columns then share one. A link column never sits alone on a row.
  // 640 to 800px: the widths where the row cannot hold all four, and Company used to wrap alone.
  for (const width of [640, 700, 768, 800] as const) {
    test(`at ${width}px no link column of the footer sits alone on a row`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoReady(page, "/watchlist");
      const rows = await page.evaluate(() => {
        const columns = [...document.querySelectorAll("footer [data-footer-column]")];
        const tops = columns.map((el) => Math.round(el.getBoundingClientRect().top));
        const links = columns.map((el) => el.querySelector("ul") !== null);
        return [...new Set(tops)].map((top) => ({ top, columns: tops.filter((t) => t === top).length, linkColumns: tops.filter((t, i) => t === top && links[i]).length }));
      });
      expect(rows.reduce((n, row) => n + row.linkColumns, 0), "three link columns").toBe(3);
      const alone = rows.filter((row) => row.linkColumns === 1 && row.columns === 1);
      expect(alone, `rows: ${JSON.stringify(rows)}`).toEqual([]);
      // and the three stand on one row
      expect(rows.filter((row) => row.linkColumns > 0).map((row) => row.linkColumns), `rows: ${JSON.stringify(rows)}`).toEqual([3]);
    });
  }

  // The other side of that fix: the three columns are one flex item now, and its basis is the three columns' own, so
  // the narrowest window that held all four on one row before (834px) still does. A basis any wider wraps them early.
  test("at 834px the brand and the three link columns still share one row", async ({ page }) => {
    await page.setViewportSize({ width: 834, height: 900 });
    await gotoReady(page, "/watchlist");
    const tops = await page.locator("footer [data-footer-column]").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(tops).toHaveLength(4);
    expect(new Set(tops).size, `column tops: ${tops.join(", ")}`).toBe(1);
  });
});

// The same form in its other place, /pre-booking's "Notify me" plate (shown once a search has answered): the same row,
// so the same floor. At 100% it is as it was drawn: the field and the button on one line.
test.describe("the pre-booking plate's form keeps the same floor", () => {
  test.skip(({ isMobile }) => isMobile, "each test sets its own window");

  // Not 280px at 200%: there the plate's form is 118px, under the floor, so the field has the whole row with or
  // without the floor, and the case passed with the fix taken out.
  for (const [width, percent] of [
    [320, 200],
    [390, 200],
    [390, 100],
    [1440, 100],
  ] as const) {
    test(`at ${width}px with its text at ${percent}%`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      if (percent !== 100) await page.addInitScript((pct) => document.addEventListener("DOMContentLoaded", () => document.documentElement.style.setProperty("font-size", `${pct}%`)), percent);
      await gotoReady(page, "/pre-booking");
      await page.getByLabel("From", { exact: true }).fill("SBC");
      await page.getByLabel("To", { exact: true }).fill("NDLS");
      await page.getByLabel("To", { exact: true }).blur();
      await page.getByLabel("Journey date").fill("2026-10-15");
      await page.getByRole("button", { name: "Find trains" }).click();
      const field = page.getByRole("main").locator("input[name='email']");
      const plate = field.locator("xpath=ancestor::form[1]");
      await expect(field).toBeVisible({ timeout: 30_000 });
      const [f, b, o] = await Promise.all([field.boundingBox(), plate.getByRole("button", { name: m.form.notify }).boundingBox(), plate.boundingBox()]);
      if (!f || !b || !o) throw new Error("the plate's form is not drawn");
      const rem = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
      const floor = Math.min(7.5 * rem, o.width) - 1;
      const measured = `field ${Math.round(f.width)}px, button ${Math.round(b.width)}px at y ${Math.round(b.y)}, form ${Math.round(o.width)}px`;
      expect(f.width, `the field is under its floor (${Math.round(floor)}px): ${measured}`).toBeGreaterThanOrEqual(floor);
      const wrapped = b.y >= f.y + f.height - 1;
      if (percent === 100) expect(wrapped, `at 100% the button stays beside the field: ${measured}`).toBe(false);
      if (wrapped) expect(Math.round(b.width), `a button under the field is the form wide: ${measured}`).toBe(Math.round(o.width));
      if (wrapped) expect(Math.round(f.width), `a field with the row to itself is the form wide: ${measured}`).toBe(Math.round(o.width));
    });
  }
});

test("in forced colours the band's hairline is still drawn, as the footer's is", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await gotoReady(page, "/watchlist");
  const lines = await page.evaluate(() => {
    const line = (el: Element | null) => {
      if (!el) throw new Error("a rule is missing");
      const cs = getComputedStyle(el);
      return { width: cs.borderTopWidth, style: cs.borderTopStyle, colour: cs.borderTopColor, box: Math.round(el.getBoundingClientRect().width) };
    };
    return { forced: window.matchMedia("(forced-colors: active)").matches, band: line(document.querySelector("#updates hr")), footer: line(document.querySelector("footer")), frame: Math.round(document.querySelector("#updates [data-rise]")!.parentElement!.getBoundingClientRect().width) };
  });
  expect(lines.forced, "forced colours are on").toBe(true);
  // A background is dropped in forced colours; a border is drawn in the system's own colour.
  expect([lines.band.width, lines.band.style]).toEqual(["1px", "solid"]);
  expect(lines.band.colour).toBe(lines.footer.colour);
  expect(lines.band.box, "the sheet's width").toBe(lines.frame);
});

test("a client navigation starts the band's form afresh", async ({ page, isMobile }) => {
  test.skip(isMobile, "one viewport is enough: the footer's links are the same");
  await gotoReady(page, "/");
  await band(page).getByLabel(m.form.label, { exact: true }).fill("asha@example.in");
  await footer(page).getByRole("link", { name: "Watchlist", exact: true }).click();
  await page.waitForURL("**/watchlist");
  await expect(band(page)).toHaveAttribute("data-variant", "slim");
  await expect(band(page).getByLabel(m.form.label, { exact: true })).toHaveValue("");
  // and a refusal does not follow the reader either
  await band(page).getByLabel(m.form.label, { exact: true }).fill("nope");
  await band(page).getByRole("button", { name: m.form.subscribe }).click();
  await expect(band(page).getByRole("alert")).toHaveText(m.errors.invalid);
  await footer(page).getByRole("link", { name: "Accuracy", exact: true }).click();
  await page.waitForURL("**/accuracy");
  await expect(band(page).getByRole("alert")).toHaveCount(0);
  await expect(band(page).getByLabel(m.form.label, { exact: true })).toHaveValue("");
});
