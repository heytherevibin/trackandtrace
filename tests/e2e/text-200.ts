import { expect, type Page } from "@playwright/test";
import { PNR, enterPnr, gotoReady } from "./helpers";
import { waitForJourney } from "./journey/journey-helpers";
import { cutText, layoutBreaks } from "./layout";
import { UNSUBSCRIBE } from "./subscribe-link";
import { report, undersizedTargets } from "./targets";

// Every traveller page with its text at 200% (WCAG 1.4.4 Resize Text, 1.4.10 Reflow), at every width from a 280px phone
// to a 1440px desk: nothing scrolls sideways, no text is cut, no word is broken where its line could have held it (a
// word longer than its whole line does break, and that is allowed: "Karnatak/a" in a 280px window), every control still
// answers a finger across 44px, and no field is squeezed below a width a reader can type in or too narrow for the
// value it holds. responsive.spec.ts runs three of the widths
// on every PR; the nightly (nightly/text-200.spec.ts) runs all nine.

/** The widths the sweep knows: the phones, the first width past each of the layout's breakpoints, and the desks. */
export const WIDTHS_AT_200 = [280, 320, 360, 390, 640, 768, 1024, 1280, 1440] as const;

/** Text at 200%, from before the page's first paint: the root's font size doubled, as a text-only zoom does. Lengths in
 * rem double with it; media queries do not move (they read the browser's own default size, which this leaves alone),
 * so a 1440px window keeps its desk layout with letters twice the size. That is the harder case of the two a reader
 * can cause. The other is the browser's own default font size at 32px, which also doubles every rem breakpoint and
 * hands a 1280px window the phone layout: the nightly's text-200-browser project launches Chromium so, and there the
 * root is already doubled and is left as the browser set it. */
export async function text200(page: Page): Promise<void> {
  await page.addInitScript(() =>
    document.addEventListener("DOMContentLoaded", () => {
      if (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) < 31.5) document.documentElement.style.setProperty("font-size", "200%");
    }),
  );
}

const SAVED = [
  {
    pnr: PNR.mixed,
    label: "12627 · SBC→NDLS · 19 Sept",
    addedAt: "2026-09-16T04:30:00.000Z",
    checks: [
      { at: "2026-09-16T04:30:00.000Z", status: "WL", position: 14 },
      { at: "2026-09-17T04:30:00.000Z", status: "RAC", position: 4 },
    ],
  },
  { pnr: PNR.cnf, label: "12951 · BCT→NDLS · 21 Sept", addedAt: "2026-09-16T04:30:00.000Z", checks: [] },
];
const WATCHLIST_KEY = "tt.watchlist.v2";

/** A page in one of its states, as a reader brings it there. */
export interface State {
  readonly name: string;
  readonly open: (page: Page) => Promise<void>;
  /** A popup the state has open: the 44px targets are read inside it (it covers the controls under it, which answer
   * no finger until it closes). `shared` names controls that share one row of the window between them and cannot each
   * be 44px wide below `below` px of window: there they are held to 44px of height and 32px of width instead. */
  readonly popup?: { readonly within: string; readonly shared?: { readonly selector: string; readonly below: number } };
}

const at = (path: string): State => ({ name: path, open: (page) => gotoReady(page, path) });

/** A route search is rationed at six a minute an address (ROUTE_AVAILABILITY_RATE_LIMIT), and a worker shares one
 * address across its tests (fixtures.ts). The sweep searches twice a width, so each search asks from an address of its
 * own: refused, the page draws the refusal instead of the list this state is here to measure (the nightly met it at
 * 1280px, about one run in three). TEST-NET-2, as the fixtures' addresses are TEST-NET-3. */
let searches = 0;
async function searchTrains(page: Page): Promise<void> {
  searches += 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `198.51.100.${((process.pid + searches) % 250) + 1}` });
  await gotoReady(page, "/pre-booking");
  await page.getByLabel("From", { exact: true }).fill("SBC");
  await page.getByLabel("To", { exact: true }).fill("NDLS");
  await page.getByLabel("To", { exact: true }).blur();
  await page.getByLabel("Journey date").fill("2026-10-15");
  // the route has answered: the button is offered only then
  await expect(page.getByRole("button", { name: "Find trains" })).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: "Find trains" }).click();
  await expect(page.getByTestId("train-row").first()).toBeVisible({ timeout: 30_000 });
}

/** The landing's intro has let go of the title: while it plays, the title is one box a letter (intro.ts), which can
 * turn the line anywhere and so hides a word too wide for its column. Measured after, the title is words again. */
async function introOver(page: Page): Promise<void> {
  await expect(page.locator("#hero-title span span")).toHaveCount(0, { timeout: 15_000 });
}

/** Every (site) route, in each state the fixture-mode server can draw. /subscribe/confirm's Before and After need a row
 * in the database, which that server has none of: it draws the invalid link, on the page frame the unsubscribe page
 * shares (SubscriptionPage), whose Before and After are both here.
 *
 * One popup is here, the date field's calendar. The route popover and the account menu are the nightly's
 * (sizes.spec.ts). */
export const STATES: readonly State[] = [
  {
    name: "/",
    open: async (page) => {
      await gotoReady(page, "/");
      await waitForJourney(page);
      // the drawing has decided: pinned live, or the still
      await expect(page.locator('html[data-drawing="still"], #anatomy.is-live')).not.toHaveCount(0, { timeout: 25_000 });
      await introOver(page);
    },
  },
  {
    name: "/ with a record in the plate",
    open: async (page) => {
      await gotoReady(page, "/");
      await waitForJourney(page);
      await introOver(page);
      await enterPnr(page, PNR.mixed);
      await page.getByRole("button", { name: "Run", exact: true }).first().click();
      await expect(page.getByRole("link", { name: "Open full record" }).first()).toBeVisible({ timeout: 30_000 });
      // The plate morphs from its entry to its record (plate-morph.tsx): its height is tweened inline, the record
      // clipped by it until it settles. Measured before that, the record's foot is hidden and answers no finger.
      const morphing = page.locator('[style*="height"]:has([data-testid="terminal-result"])');
      await expect(morphing).toHaveCount(0, { timeout: 10_000 });
    },
  },
  {
    name: "/watchlist, empty",
    open: async (page) => {
      await gotoReady(page, "/watchlist");
      await page.evaluate((key) => window.localStorage.removeItem(key), WATCHLIST_KEY);
      await gotoReady(page, "/watchlist");
    },
  },
  at("/pre-booking"),
  { name: "/pre-booking, after a search", open: searchTrains },
  {
    name: "/pre-booking, a train's classes open",
    open: async (page) => {
      await searchTrains(page);
      await page.getByTestId("train-row").first().getByRole("button").last().click();
    },
  },
  {
    // Seven day cells cannot each be 44px wide in a window under 352px (7 × 44, the frame and the 8px kept each side):
    // there they share the window's width.
    name: "/pre-booking, the calendar open",
    open: async (page) => {
      await gotoReady(page, "/pre-booking");
      await page.getByRole("button", { name: "Choose a date" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
    popup: { within: '[role="dialog"]', shared: { selector: '[role="dialog"] button', below: 352 } },
  },
  at("/accuracy"),
  at("/login"),
  at("/account"),
  at("/e2e/signed-in"),
  at(`/pnr#${PNR.mixed}`),
  at(`/pnr#${PNR.cnf}`),
  at(`/pnr#${PNR.notFound}`),
  at("/pnr"),
  at("/pnr/abc"),
  at("/privacy"),
  at("/tos"),
  at("/offline"),
  at("/nowhere"),
  at("/subscribe/confirm"),
  at("/unsubscribe"),
  at(UNSUBSCRIBE.valid),
  {
    name: "/unsubscribe, after the press",
    open: async (page) => {
      // The route stubbed, so the After state draws without a database behind it.
      await page.route("**/api/unsubscribe", (route) => route.fulfill({ json: { ok: true, state: "done" } }));
      await gotoReady(page, UNSUBSCRIBE.valid);
      await page.getByRole("main").getByRole("button").first().click();
      await expect(page.locator("fieldset label").first()).toBeVisible();
    },
  },
  {
    // last: it leaves two saved records in the page's storage
    name: "/watchlist, two saved",
    open: async (page) => {
      await gotoReady(page, "/watchlist");
      await page.evaluate(({ key, saved }) => window.localStorage.setItem(key, JSON.stringify(saved)), { key: WATCHLIST_KEY, saved: SAVED });
      await gotoReady(page, "/watchlist");
    },
  },
];

/** A field narrower than this cannot show what is typed into it: twelve of its own letters at 100%, six at 200%. The
 * floor subscribe-layout.spec.ts holds the email field to. */
const FIELD_MIN = 120;

/** Fields too narrow to type in, or to show what they hold: every drawn text field, select and text area under
 * FIELD_MIN, and every field whose value is wider than the field (its content scrolls inside it: a date cut to "0/2026"). */
export async function narrowFields(page: Page): Promise<string[]> {
  return page.evaluate((min) => {
    const found: string[] = [];
    for (const el of document.querySelectorAll<HTMLInputElement>('input:not([type="hidden"], [type="checkbox"], [type="radio"], [type="submit"], [type="button"]), select, textarea')) {
      if (!el.checkVisibility({ checkVisibilityCSS: true, opacityProperty: true }) || el.closest(".sr-only, [aria-hidden='true']")) continue;
      const box = el.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue; // a proxy, clipped to nothing
      const label = el.getAttribute("aria-label") ?? el.labels?.[0]?.textContent?.trim() ?? el.getAttribute("name") ?? el.tagName.toLowerCase();
      if (box.width < min) found.push(`the field "${label.slice(0, 32)}" is ${Math.round(box.width)}px wide, under ${min}px`);
      if (!("value" in el) || el.value === "" || el.tagName === "SELECT") continue;
      // A date field draws its value in parts of its own, which its scroll width does not count: the value's width is
      // measured as the field's own type draws it (ten figures and two separators, whatever the order).
      const style = getComputedStyle(el);
      const room = el.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
      const pen = document.createElement("canvas").getContext("2d");
      if (!pen) throw new Error("no canvas to measure with");
      pen.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const shown = el.type === "date" ? "00/00/0000" : style.textTransform === "uppercase" ? el.value.toUpperCase() : el.value;
      const cut = Math.max(el.scrollWidth - el.clientWidth, Math.ceil(pen.measureText(shown).width - room));
      if (cut > 1) found.push(`the field "${label.slice(0, 32)}" cuts ${cut}px off the value it holds`);
    }
    return found;
  }, FIELD_MIN);
}

/** Words broken across two lines anywhere on the page, where their line could have held them: each word a reader sees,
 * read as a range. A word may turn the line where the language lets it (after a hyphen, a dash or a slash, each part
 * read as a word of its own), and a word as long as the whole line its block gives it, or longer, has to break
 * somewhere (an address, a hash, "Karnataka" in a 280px window at 200%). A box that hyphenates (hyphens: auto, the
 * principles sheet) may turn a word at a syllable, which is read here as the browser does it: a word of five letters
 * or more, two or more of them on each line, in a box that does not also break anywhere (word-break, overflow-wrap:
 * anywhere). Nothing else may. layout.ts's brokenWords is the same reading without those allowances, for headings. */
export async function wordsBrokenMidWord(page: Page, scope = "body"): Promise<string[]> {
  return page.evaluate((root) => {
    const found: string[] = [];
    const lineOf = (el: Element): number => {
      let block: Element | null = el;
      while (block && getComputedStyle(block).display === "inline") block = block.parentElement;
      if (!block) return Number.POSITIVE_INFINITY;
      const style = getComputedStyle(block);
      return block.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
    };
    const scopeEl = document.querySelector(root);
    if (!scopeEl) throw new Error(`nothing matches ${root}`);
    const walker = document.createTreeWalker(scopeEl, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      const value = node.textContent ?? "";
      if (!parent || value.trim() === "" || parent.closest(".sr-only, [aria-hidden='true'], svg, noscript, script, style, nextjs-portal") || !parent.checkVisibility()) continue;
      const style = getComputedStyle(parent);
      const hyphenates = style.hyphens === "auto" && !["break-all", "break-word"].includes(style.wordBreak) && style.overflowWrap !== "anywhere";
      for (const word of value.matchAll(/[^\s\-\u2010-\u2015/]+[\-\u2010-\u2015/]*/g)) {
        const range = document.createRange();
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0);
        if (new Set(rects.map((r) => Math.round(r.top))).size <= 1) continue;
        if (hyphenates) {
          // letters a line, read one letter at a time: a syllable's turn leaves two or more on every line
          const lines = new Map<number, number>();
          for (let i = 0; i < word[0].length; i += 1) {
            const letter = document.createRange();
            letter.setStart(node, word.index + i);
            letter.setEnd(node, word.index + i + 1);
            const top = Math.round(letter.getBoundingClientRect().top);
            lines.set(top, (lines.get(top) ?? 0) + 1);
          }
          if (word[0].length >= 5 && [...lines.values()].every((letters) => letters >= 2)) continue;
        }
        const whole = rects.reduce((sum, r) => sum + r.width, 0);
        const line = lineOf(parent);
        if (whole > line - 1) continue; // as long as its whole line, or longer
        found.push(`"${word[0].slice(0, 32)}" (${Math.round(whole)}px) is broken across lines of ${Math.round(line)}px in ${parent.tagName.toLowerCase()}`);
      }
    }
    return [...new Set(found)].slice(0, 12);
  }, scope);
}

/** Controls that share a row of the window too narrow for 44px each: every one still 44px tall and 32px wide. */
async function sharedTargets(page: Page, selector: string): Promise<string[]> {
  return page.locator(selector).evaluateAll((controls) =>
    controls.flatMap((el) => {
      const box = el.getBoundingClientRect();
      const name = (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 32);
      return box.width > 0 && (box.height < 44 || box.width < 32) ? [`${name} [${Math.round(box.width)}x${Math.round(box.height)}] is under 32x44, sharing its row`] : [];
    }),
  );
}

/** Everything wrong with the page as it stands, in the reader's words; empty when it reflows. */
export async function breaksAt200(page: Page, popup?: State["popup"]): Promise<string[]> {
  // A page still loading shows skeletons, whose sheen slides past each block's clipped edge (responsive.spec.ts).
  await expect(page.locator(".skeleton")).toHaveCount(0, { timeout: 30_000 });
  const size = await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
  if (size < 31.5) throw new Error(`the page's text is at ${size}px, not at 200%: this sweep would measure the page at 100%`);
  const shared = popup?.shared && (page.viewportSize()?.width ?? 0) < popup.shared.below ? popup.shared.selector : undefined;
  const targets = [...report(await undersizedTargets(page, popup?.within ?? "body", shared)), ...(shared ? await sharedTargets(page, shared) : [])];
  return [...(await layoutBreaks(page)), ...(await cutText(page)), ...(await wordsBrokenMidWord(page)), ...(await narrowFields(page)), ...targets];
}

/** Opens every state at the window's present width and gathers what breaks, state by state; empty when all reflow. */
export async function sweepAt200(page: Page, states: readonly State[] = STATES): Promise<string[]> {
  const failures: string[] = [];
  for (const state of states) {
    await state.open(page);
    const breaks = await breaksAt200(page, state.popup);
    if (breaks.length > 0) failures.push(`${state.name}\n  ${breaks.join("\n  ")}`);
  }
  return failures;
}
