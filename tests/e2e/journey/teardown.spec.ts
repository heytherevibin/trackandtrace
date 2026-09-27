import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { PNR } from "../helpers";
import { motionOff, waitForJourney } from "./journey-helpers";

// Every module's teardown puts the server's markup back (spec §3.B). One generic proof: a page that ran the
// whole journey with Motion on — the intro, every section scrolled through and back, a check to a result and
// cleared — and is then switched to Motion off must read exactly as a page that only ever ran with Motion off.
// The Motion switch tears every module down and rebuilds them all still, so anything a teardown leaves behind
// (a drawn stroke's dash, a revert's stale transform, a class) shows up as a difference.

/** Inline style properties the journey's modules write; every other inline style is React's or the browser's. */
const STYLE = ["transform", "opacity", "left", "top", "height", "stroke-width", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap"] as const;

interface Live {
  readonly selector: string;
  /** "text" drops the element's own text, "style" its inline styles, "subtree" the element itself; anything
   * else is an attribute. */
  readonly drop: readonly string[];
}

/** Live values only: true readings that differ by the moment they are read, never by what a teardown left. */
const LIVE: readonly Live[] = [
  // The station clock names the current minute, which moves between the two runs.
  { selector: ".station-clock", drop: ["aria-label"] },
  // The IST clocks (masthead, footer bar) read the current minute too, and flip when it turns.
  { selector: 'span[role="img"][aria-label$=" IST"]', drop: ["subtree"] },
  // The hands' angles are the time itself (React draws the hour and minute hands at mount).
  { selector: ".clock-hand", drop: ["transform"] },
  // The rail's odometer follows the scroll position, which the two runs reach differently.
  { selector: ".strip-odo", drop: ["text"] },
  // The current stop follows the scroll position, as above.
  { selector: ".strip-stops a", drop: ["aria-current"] },
  // The board's statuses follow the strip's station, as above.
  { selector: "td.board-status", drop: ["text"] },
  // The check legitimately adds a recent chip: the plate's own record, not the journey's.
  { selector: '[data-testid="recent-strip"]', drop: ["subtree"] },
  // The plate announces its last result to assistive tech, and keeps it once cleared: React's, not the journey's.
  { selector: '[data-testid="hero-instrument"] [aria-live]', drop: ["text"] },
];

/** The masthead, the route rail and the page, one line per element: tag, classes, attributes, the journey's inline styles, own text. */
async function snapshot(page: Page): Promise<string[]> {
  return page.evaluate(
    ({ style, live }) => {
      const lines: string[] = [];
      const dropped = (el: Element, what: string) => live.some((l) => l.drop.includes(what) && el.matches(l.selector));
      const walk = (el: Element, depth: number) => {
        if (dropped(el, "subtree")) return;
        const classes = [...el.classList].sort().join(".");
        const attrs = [...el.attributes]
          .filter((a) => a.name !== "class" && a.name !== "style" && !dropped(el, a.name))
          .map((a) => `${a.name}="${a.value}"`)
          .sort();
        const css = (el instanceof HTMLElement || el instanceof SVGElement) && !dropped(el, "style") ? style.map((p) => [p, el.style.getPropertyValue(p)] as const).filter(([, v]) => v !== "") : [];
        if (css.length) attrs.push(`style{${css.map(([p, v]) => `${p}:${v}`).join(";")}}`);
        const text = dropped(el, "text")
          ? ""
          : [...el.childNodes]
              .filter((n) => n.nodeType === Node.TEXT_NODE)
              .map((n) => n.textContent ?? "")
              .join("")
              .trim();
        lines.push(`${"  ".repeat(depth)}<${el.tagName.toLowerCase()}${classes ? `.${classes}` : ""} ${attrs.join(" ")}>${text ? ` "${text}"` : ""}`);
        for (const child of el.children) walk(child, depth + 1);
      };
      for (const root of [document.querySelector("header"), document.getElementById("route-strip"), document.querySelector("main")]) if (root) walk(root, 0);
      return lines;
    },
    { style: STYLE, live: LIVE },
  );
}

/** Scrolls by half a window at a time, a few frames apart, so scroll-driven pieces and entrances all get a turn. */
async function scrollThrough(page: Page, direction: 1 | -1): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    const moved = await page.evaluate((dir) => {
      const before = window.scrollY;
      window.scrollBy({ top: (dir * window.innerHeight) / 2, behavior: "instant" });
      return window.scrollY !== before;
    }, direction);
    await page.waitForTimeout(60);
    if (!moved) return;
  }
}

test.describe("the journey's teardown", () => {
  test.skip(({ isMobile }) => isMobile, "the desktop layout runs every module; one project is enough");

  test("after a full run with Motion on, switching Motion off leaves the markup as a Motion-off page has it", async ({ page, browser, baseURL }) => {
    test.setTimeout(90_000);

    // The baseline: a page that only ever ran with Motion off, in a context of its own (no intro, no recents).
    const still = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 } });
    const stillPage = await still.newPage();
    await motionOff(stillPage);
    await stillPage.goto("/");
    await waitForJourney(stillPage);
    await stillPage.waitForTimeout(300);
    const before = await snapshot(stillPage);
    await still.close();

    // The run: Motion on, the intro played out, every section scrolled through and back, a check read and cleared.
    await page.goto("/");
    await waitForJourney(page);
    await expect(page.locator(".intro-outline, .intro-rule")).toHaveCount(0, { timeout: 10_000 });
    await expect(page.locator("header")).not.toHaveClass(/is-plotting/);
    await page.waitForTimeout(1500);
    await scrollThrough(page, 1);
    await scrollThrough(page, -1);
    const plate = page.getByTestId("hero-instrument");
    await plate.getByRole("textbox").fill(PNR.cnf);
    await plate.getByRole("button", { name: /run/i }).click();
    const result = page.getByTestId("terminal-result");
    await expect(result).toBeVisible();
    await expect(result).toHaveAttribute("data-kind", "ok");
    await expect(page.locator(".hero-dial")).toHaveClass(/is-face/);
    await page.waitForTimeout(1500);
    await plate.getByRole("button", { name: /check another pnr/i }).click();
    await expect(page.locator(".hero-dial")).not.toHaveClass(/is-face/);

    // Motion off with the footer's own switch, then back to the top, where the baseline was read.
    await page.getByRole("contentinfo").getByRole("switch", { name: "Motion" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "off");
    await page.waitForTimeout(300);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(500);
    await expect(page.locator("html")).toHaveAttribute("data-journey", "on");

    expect(await snapshot(page)).toEqual(before);
  });
});
