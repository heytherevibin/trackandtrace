import type { Page } from "@playwright/test";
import { messages } from "@/messages";
import { expect, test } from "./fixtures";
import { PNR, axeResults, gotoReady } from "./helpers";
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

  /** The field keeps a usable width, the button is whole, and the consent line sits under the field. */
  async function expectFormWhole(page: Page, label: string): Promise<void> {
    const section = page.locator("#updates");
    const [field, button, consent, frame] = await Promise.all([
      section.locator("input[name='email']").boundingBox(),
      section.getByRole("button", { name: m.form.subscribe }).boundingBox(),
      section.locator("p", { has: page.locator("a[href='/privacy']") }).boundingBox(),
      section.boundingBox(),
    ]);
    if (!field || !button || !consent || !frame) throw new Error(`${label}: the band's form is not drawn`);
    const vw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(field.width, `${label}: the field's width`).toBeGreaterThanOrEqual(120);
    expect(field.height, `${label}: the field's height`).toBeGreaterThanOrEqual(44);
    expect(button.height, `${label}: the button's height`).toBeGreaterThanOrEqual(44);
    expect(button.x + button.width, `${label}: the button ends inside the window`).toBeLessThanOrEqual(vw);
    expect(consent.y, `${label}: the consent line is under the field`).toBeGreaterThanOrEqual(field.y + field.height);
    expect(consent.y + consent.height, `${label}: the consent line is inside the band`).toBeLessThanOrEqual(frame.y + frame.height + 1);
  }

  for (const width of [280, 320, 360, 390, 768, 1024, 1440] as const) {
    for (const path of ["/", "/accuracy"] as const) {
      test(`${path} at ${width}px: nothing of the band breaks the layout, is cut or runs past the window`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
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
      });
    }
  }
});
