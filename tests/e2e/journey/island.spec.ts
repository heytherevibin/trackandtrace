import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import { PNR } from "../helpers";
import { blockJourneyChunk, frames, noAnchoring, scrollToId, waitForJourney, waitForLive } from "./journey-helpers";

/** Frames the wait below gives a focus that never comes wholly into the window before checking it as it stands
 * (it then counts as hidden: the check samples the window's edge). The longest glide in the run, Tab wrapping from
 * the footer back to the hero's field, took 184 frames locally; a slower runner draws fewer frames, not more. */
const FOCUS_SETTLE_FRAME_CAP = 600;

/** `<html data-scroll-behavior="smooth">` (base.css) animates every focus-driven scroll; without this, reading
 * the focused element's geometry mid-animation reports positions no reader ever actually sees it at. Waits, in
 * frames, until the focused element lies wholly inside the window, no scroll is under way (a `scroll` since the
 * last `scrollend`), and scrollY and the element's own box have held for two frames. "scrollY stopped changing"
 * alone is not enough: it is just as true before a smooth scroll's first frame, and a CI runner can take longer than two samples to draw
 * that frame (2026-09-27: the check then read the board's "On the roadmap" link below the fold, under its own
 * table cell). A focused control the browser leaves under the masthead is already wholly in the window, so it
 * is still checked, and still caught. */
async function waitForFocusSettled(page: Page): Promise<void> {
  await page.evaluate(
    (cap) =>
      new Promise<void>((resolve) => {
        let scrolling = false;
        const onScroll = () => {
          scrolling = true;
        };
        const onScrollEnd = () => {
          scrolling = false;
        };
        window.addEventListener("scroll", onScroll);
        window.addEventListener("scrollend", onScrollEnd);
        let frames = 0;
        let held = 0;
        let lastY = window.scrollY;
        let lastAt = "";
        const tick = () => {
          frames += 1;
          const el = document.activeElement;
          const r = el && el !== document.body ? el.getBoundingClientRect() : null;
          // the focused element's own place too: the window-seat run carries its cards sideways by transform, trailing
          // the scroll, so a card can still be sliding once scrollY holds
          const at = r ? `${Math.round(r.left)},${Math.round(r.top)}` : "";
          held = window.scrollY === lastY && at === lastAt ? held + 1 : 0;
          lastY = window.scrollY;
          lastAt = at;
          const inWindow = !r || (r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight && r.right <= window.innerWidth);
          if ((inWindow && !scrolling && held >= 2) || frames >= cap) {
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("scrollend", onScrollEnd);
            resolve();
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    FOCUS_SETTLE_FRAME_CAP,
  );
}

/** Whether the focused element is actually hidden: something else paints over its centre. A fixed overlay
 * drawn on top (the skip link, above the masthead by z-index) is never "hidden" just because its box sits in
 * the masthead's own vertical band — only `elementFromPoint` returning neither the element nor one of its
 * own descendants (an icon inside a button, say) counts as a real cover. The cursor and every drawing have
 * `pointer-events: none`, so a drawing on top never trips this either. `nextjs-portal` hosts the dev-only
 * toolbar (collisions.ts ignores it too, spec 2026-09-24 §5); it never ships to production and a reader never
 * tabs to anything inside it. Evaluated in the page, not called from Node. */
function coveredFocusLabel(): string | null {
  const el = document.activeElement;
  if (!el || el === document.body || el.tagName === "NEXTJS-PORTAL") return null;
  const r = el.getBoundingClientRect();
  const x = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
  const y = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1);
  const top = document.elementFromPoint(x, y);
  const covered = top !== null && top !== el && !el.contains(top);
  return covered ? `${el.tagName} ${el.textContent?.trim().slice(0, 40)}` : null;
}

test.describe("the journey island", () => {
  test("starts once the page is idle", async ({ page }) => {
    await page.goto("/");
    await waitForJourney(page);
  });

  test("a blocked journey chunk leaves the page still, and the check still works", async ({ page }) => {
    await blockJourneyChunk(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-journey", "failed", { timeout: 15_000 });
    const plate = page.getByTestId("hero-instrument");
    await plate.getByRole("textbox").fill(PNR.cnf);
    await plate.getByRole("button", { name: /run/i }).click();
    await expect(page.getByTestId("terminal-result")).toBeVisible();
  });

  test("never starts on other pages", async ({ page }) => {
    await page.goto("/accuracy");
    await page.waitForTimeout(2_000);
    await expect(page.locator("html")).not.toHaveAttribute("data-journey", /.+/);
  });
});

for (const blocked of [false, true]) {
  test(`every sample check reads its record with the journey ${blocked ? "blocked" : "on"}`, async ({ page }) => {
    if (blocked) await blockJourneyChunk(page);
    await page.goto("/");
    const plate = page.getByTestId("hero-instrument");
    for (const pnr of [PNR.cnf, PNR.rac, PNR.wl, PNR.mixed, PNR.notFound]) {
      await plate.getByRole("textbox").fill(pnr);
      await plate.getByRole("button", { name: /run/i }).click();
      const result = page.getByTestId("terminal-result");
      await expect(result).toBeVisible();
      // Visible alone also passes for limited, refused and unavailable: this proves the record was actually
      // read, not just that some terminal state rendered.
      await expect(result).toHaveAttribute("data-kind", pnr === PNR.notFound ? "notfound" : "ok");
      await page.getByRole("button", { name: /check another pnr/i }).click();
    }
  });
}

test("Tab never leaves focus under the masthead or behind a pinned piece", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard");
  test.setTimeout(90_000); // 80 steps, each scrolling a page whose live drawing a software GPU draws slowly
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await waitForJourney(page);
  for (let i = 0; i < 80; i += 1) {
    await page.keyboard.press("Tab");
    await waitForFocusSettled(page);
    expect(await page.evaluate(coveredFocusLabel)).toBeNull();
  }
});

test("the wait before each check holds for a focus scroll that starts late, as on a slow runner", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await waitForJourney(page);
  // At the top of the page the board's "On the roadmap" link rests just below a 900px window's fold, so focusing
  // it takes the browser's smooth scroll. Focus moves here with no scroll, and the browser's own focus scroll only
  // starts 250 ms later: a runner that draws no frame for that long after the Tab. Until then the link is below
  // the window, and the check, sampling the window's last row, would find its own table cell over it.
  const below = await page.evaluate(() => {
    const link = document.querySelector<HTMLElement>('#departures a[href="#roadmap"]')!;
    link.focus({ preventScroll: true });
    setTimeout(() => {
      link.blur();
      link.focus();
    }, 250);
    return link.getBoundingClientRect().bottom > window.innerHeight;
  });
  expect(below).toBe(true);
  await waitForFocusSettled(page);
  expect(await page.evaluate(coveredFocusLabel)).toBeNull();
});

test("the check still catches a real cover: an in-flow link scrolled in under the sticky masthead", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  // Focusable elements never get base.css's scroll-margin-top (deliberately — see its own comment), so an
  // ordinary in-flow link can sit flush behind the sticky masthead once focused. Scrolled and focused directly
  // here, rather than by tabbing there, so the scenario is exact instead of depending on tab order. The link
  // is Reliability's "Read the data policy" — mid-page, with plenty of section below it to scroll through, so
  // the target scroll position is never clamped by the document's end (unlike a footer link, which is at the
  // very bottom and cannot be scrolled any higher than its own resting place).
  await page.evaluate(() => {
    const link = document.querySelector('#reliability a[href="/accuracy"]') as HTMLElement;
    const headerBottom = document.querySelector("header")!.getBoundingClientRect().bottom;
    const linkTop = link.getBoundingClientRect().top;
    window.scrollTo({ top: window.scrollY + linkTop - headerBottom / 2, behavior: "instant" });
    link.focus();
  });
  expect(await page.evaluate(coveredFocusLabel)).not.toBeNull();
});

// The browser's own glide to a Tab stop, cut short (Task 6 review): the drawing above falls to the still mid-glide, and
// the instant scrolls that keep the reader's place (keepPlace, the still's settle) cancel the smooth one, stranding focus
// off-screen at rest. The glide must be taken up again. The drawing is live here: its fall to the still is the trigger.
for (const anchoring of ["on", "off"] as const) {
  test(`a Tab stop's glide reaches the window though the drawing above falls to the still mid-glide (scroll anchoring ${anchoring})`, async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard");
    await page.setViewportSize({ width: 1440, height: 900 });
    if (anchoring === "off") await noAnchoring(page);
    await page.goto("/");
    await waitForLive(page);
    await scrollToId(page, "record", 100); // past the drawn train; 04's link below the window
    await frames(page, 3);
    await page.evaluate(() => {
      const link = [...document.querySelectorAll<HTMLAnchorElement>("#reliability a")].find((a) => a.textContent?.includes("Read the data policy"));
      if (!link) throw new Error("no data policy link");
      link.focus(); // the browser glides it into the window
      requestAnimationFrame(() => requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("tt:webgl", { detail: "lost" }))));
    });
    await expect(page.locator("html")).toHaveAttribute("data-drawing", "still");
    await waitForFocusSettled(page);
    await frames(page, 10); // at rest
    const seen = await page.evaluate(() => {
      const r = document.activeElement?.getBoundingClientRect();
      const foot = document.querySelector("header")?.getBoundingClientRect().bottom ?? 0;
      return r !== undefined && r.top >= foot && r.bottom <= window.innerHeight;
    });
    expect(seen, "the focused link is wholly in the window, below the masthead").toBe(true);
    expect(await page.evaluate(coveredFocusLabel)).toBeNull();
  });
}
