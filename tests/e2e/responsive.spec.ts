import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { PNR, gotoReady } from "./helpers";

// Every route fits a phone: no sideways page scroll, nothing drawn past the screen edge, and no
// container that hides part of its content (a clipped nav strip, a table wider than its plate).

const WIDTHS = [320, 360, 390, 768] as const;
const ROUTES = ["/", "/watchlist", "/pre-booking", "/accuracy", "/login", "/account", `/pnr/${PNR.mixed}`, `/pnr/${PNR.notFound}`, "/pnr/abc", "/check", "/privacy", "/tos", "/offline", "/nowhere"] as const;

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

/** Describes everything that breaks the phone layout on the current page; empty when it fits. */
async function layoutBreaks(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const name = (el: Element) => {
      const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 32);
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${text ? ` "${text}"` : ""}`;
    };
    /** Inside a visually hidden box (sr-only at any breakpoint: 1px, clipped): announced, never drawn. */
    const visuallyHidden = (el: Element) => {
      for (let node: Element | null = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        const clipped = style.clipPath.startsWith("inset(50%") || (box.width <= 1 && box.height <= 1 && style.overflow === "hidden");
        if (style.position === "absolute" && clipped) return true;
      }
      return false;
    };
    const shown = (el: Element) => {
      if (el.closest("nextjs-portal, script, style")) return false;
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      const box = el.getBoundingClientRect();
      return box.width > 1 && box.height > 1 && !visuallyHidden(el);
    };
    const breaks: string[] = [];
    if (document.documentElement.scrollWidth > vw) breaks.push(`page scrolls sideways: ${document.documentElement.scrollWidth}px in ${vw}px`);
    for (const el of document.body.querySelectorAll("*")) {
      if (!shown(el)) continue;
      const box = el.getBoundingClientRect();
      if (box.right > vw + 1 || box.left < -1) breaks.push(`past the edge [${Math.round(box.left)}, ${Math.round(box.right)}]: ${name(el)}`);
      const style = getComputedStyle(el);
      const clips = style.overflowX !== "visible" && !["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) && style.textOverflow !== "ellipsis";
      if (clips && el.scrollWidth > el.clientWidth + 1) breaks.push(`hides ${el.scrollWidth - el.clientWidth}px of its content: ${name(el)}`);
    }
    return breaks.slice(0, 12);
  });
}

test.describe("phone and tablet widths", () => {
  test.skip(({ isMobile }) => !isMobile, "runs once, on the phone project, across the widths");

  for (const width of WIDTHS) {
    test(`every route fits ${width}px`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript((saved) => window.localStorage.setItem("tt.watchlist.v2", JSON.stringify(saved)), SAVED);
      const failures: string[] = [];
      for (const route of ROUTES) {
        await gotoReady(page, route);
        const breaks = await layoutBreaks(page);
        if (breaks.length > 0) failures.push(`${route}\n  ${breaks.join("\n  ")}`);
      }
      expect(failures, failures.join("\n")).toEqual([]);
    });
  }
});
