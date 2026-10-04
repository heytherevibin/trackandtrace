import type { Page } from "@playwright/test";

/** Boxes that clip, on purpose, a track the scroll carries sideways through them, each proven elsewhere to bring every
 * part of it to the window: the window-seat run's pin (overflow: clip, inside the window), whose track runs on past the
 * window's side by design, never scrolls the page, and stands each station at rest wholly inside the pin (responsive.spec.ts).
 * What such a box clips is not "past the edge", nor is it content the box "hides", while the box itself clips sideways
 * (overflow-x: clip, never a scroller) and lies inside the window; everything else in and around it is measured as ever. */
const CARRIED = ["#run.is-running > .run-pin"] as const;

/** Drawings behind the page's words that the page clips at its own edge, by design and at every text size: the hero's
 * dial (journey.css: wider than its column, `main` clips it "as v3 does"), announced to nobody (aria-hidden) and
 * answering no pointer. Such a drawing is not content a reader loses: it is left out of "past the edge", and the box
 * that clips it is measured without it, so real content that box hides is still found. */
const DRAWN_BEHIND = [".hero-dial"] as const;

/** A reader's own scroller (WCAG 1.4.10's exception for a table that cannot reflow): one of the site's three named
 * scroll regions (scroll-region.tsx), and only from the width where its table is a table. Below that width the same
 * table is stacked records and must fit; there, and anywhere else, a scroller is a break, at any text size:
 * - passengers: the /pnr record's passenger table, from sm (40rem);
 * - availability: /pre-booking's date table, from sm (40rem);
 * - watchlist: /watchlist's saved-PNR table, from lg (64rem).
 * The landing has none. The width is a media query in rem, as the tables' own breakpoints are. */
const READERS_SCROLLERS = { passengers: "40rem", availability: "40rem", watchlist: "64rem" } as const;

/** Every scroll region on the page has measured itself, and says what is so: `data-scrolls` is "yes" exactly where the
 * region's content is wider than it. A region names itself in a ResizeObserver's callback and the commit after it, so
 * a reading taken before that sees an unnamed box that hides its content. A state to wait for, never a time. */
export async function scrollRegionsSettled(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll<HTMLElement>("[data-scroll-region]")].every((el) => {
        const scrolls = el.scrollWidth > el.clientWidth + 1;
        return el.dataset.scrolls === (scrolls ? "yes" : "no") && (!scrolls || el.getAttribute("role") === "region");
      }),
    undefined,
    { timeout: 10_000 },
  );
}

/**
 * How far the page itself can be scrolled sideways, in px: 0 when it cannot be.
 *
 * Asked of the page by scrolling it, because that is the only reading that is neither too strict nor
 * too kind. `documentElement.scrollWidth` also counts what a scroller inside the page holds (so it
 * convicts a table that scrolls in its own box, as it should), and a position read back in the same
 * tick as a plain `scrollTo` is too kind by a mile: the site's `scroll-behavior: smooth`
 * (src/styles/base.css) turns that call into an animation that has not moved yet, so the read is 0
 * on any page whatsoever. That is how the audit log's own check passed, from the day that page
 * shipped, over a page that did scroll sideways. `behavior: "instant"` is what makes the jump
 * happen before the read.
 */
export async function sidewaysScroll(page: Page): Promise<number> {
  return page.evaluate(() => {
    const top = window.scrollY;
    window.scrollTo({ left: 100_000, top, behavior: "instant" });
    const reached = Math.round(window.scrollX);
    window.scrollTo({ left: 0, top, behavior: "instant" });
    return reached;
  });
}

/** Describes everything that breaks the phone layout on the current page; empty when it fits. */
export async function layoutBreaks(page: Page): Promise<string[]> {
  await scrollRegionsSettled(page);
  return page.evaluate(({ carried, behind, scrollers }) => {
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
    /** The carrying box `el` is, or lies inside, while that box clips sideways (never a scroller a reader could move)
     * and stands inside the window. */
    const stageOf = (el: Element) => {
      const stage = carried.length > 0 ? el.closest(carried.join(", ")) : null;
      if (!stage || getComputedStyle(stage).overflowX !== "clip") return null;
      const box = stage.getBoundingClientRect();
      return box.left >= -1 && box.right <= vw + 1 ? stage : null;
    };
    /** `el` is a reader's own scroller: named, in the Tab order, one of the listed regions at a width it is listed for. */
    const isScroller = (el: Element) => {
      if (!(el instanceof HTMLElement) || !el.matches('[data-scroll-region][role="region"][tabindex="0"]:is([aria-label], [aria-labelledby])')) return false;
      const from = (scrollers as Record<string, string | undefined>)[el.dataset.scrollRegion ?? ""];
      return from !== undefined && window.matchMedia(`(min-width: ${from})`).matches && ["auto", "scroll"].includes(getComputedStyle(el).overflowX);
    };
    /** The reader's scroller `el` lies inside, while that scroller stands inside the window. */
    const scrollerOf = (el: Element) => {
      for (let region = el.parentElement?.closest("[data-scroll-region]") ?? null; region; region = region.parentElement?.closest("[data-scroll-region]") ?? null) {
        if (!isScroller(region)) continue;
        const box = region.getBoundingClientRect();
        if (box.left >= -1 && box.right <= vw + 1) return region;
      }
      return null;
    };
    /** How far `el`'s content runs past its box, the drawings behind the page taken out for the reading. */
    const hidden = (el: Element) => {
      const drawn = [...el.querySelectorAll<HTMLElement>(behind.join(", "))];
      if (drawn.length === 0) return el.scrollWidth - el.clientWidth;
      const was = drawn.map((d) => d.style.display);
      for (const d of drawn) d.style.display = "none";
      const over = el.scrollWidth - el.clientWidth;
      for (const [i, d] of drawn.entries()) d.style.display = was[i] ?? "";
      return over;
    };
    const breaks: string[] = [];
    if (document.documentElement.scrollWidth > vw) breaks.push(`page scrolls sideways: ${document.documentElement.scrollWidth}px in ${vw}px`);
    for (const el of document.body.querySelectorAll("*")) {
      if (!shown(el) || el.closest(behind.join(", "))) continue;
      const stage = stageOf(el);
      const box = el.getBoundingClientRect();
      if ((box.right > vw + 1 || box.left < -1) && !(stage && stage !== el) && !scrollerOf(el)) breaks.push(`past the edge [${Math.round(box.left)}, ${Math.round(box.right)}]: ${name(el)}`);
      const style = getComputedStyle(el);
      const clips = style.overflowX !== "visible" && !["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) && style.textOverflow !== "ellipsis";
      if (clips && el.scrollWidth > el.clientWidth + 1 && stage !== el && !isScroller(el)) {
        const over = hidden(el);
        if (over > 1) breaks.push(`hides ${over}px of its content: ${name(el)}`);
      }
    }
    return breaks.slice(0, 12);
  }, { carried: CARRIED, behind: DRAWN_BEHIND, scrollers: READERS_SCROLLERS });
}

/** Words a reader cannot read to the end (spec §9's 200% text; J6 nightly): a line of text that runs past the window's
 * side where the page clips it (the sideways overflow the collision checker sees is the page scrolling instead), or
 * text its own box cuts off inside the page: at its side (overflow hidden or clipped, an ellipsis) or at its foot
 * (overflow hidden or clipped, or clamped to a number of lines, with lines below the box). Clipped inside the page on
 * purpose by a parent (a wipe, a scroller) is left alone, as is anything screen-reader-only. Laid-out boxes, so it reads
 * the whole page (or `scope`) from wherever it stands. */
export async function cutText(page: Page, scope = "body"): Promise<string[]> {
  return page.evaluate((root) => {
    const vw = document.documentElement.clientWidth;
    const found: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(`${root} *`)) {
      const own = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "");
      if (!own || el.closest(".sr-only, [aria-hidden='true'], svg, noscript") || !el.checkVisibility()) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) continue; // screen-reader-only at some breakpoint: 1px, clipped
      const text = `"${(el.textContent ?? "").trim().slice(0, 40)}"`;
      const style = getComputedStyle(el);
      const clips = style.overflowX === "hidden" || style.overflowX === "clip" || style.textOverflow === "ellipsis";
      if (clips && el.scrollWidth > el.clientWidth + 1) found.push(`${text} is cut off by its own box (${el.scrollWidth - el.clientWidth}px)`);
      const clamped = style.getPropertyValue("-webkit-line-clamp") !== "none" && style.getPropertyValue("-webkit-line-clamp") !== "";
      const clipsFoot = style.overflowY === "hidden" || style.overflowY === "clip" || clamped;
      if (clipsFoot && el.scrollHeight > el.clientHeight + 1) found.push(`${text} is cut off at its foot by its own box (${el.scrollHeight - el.clientHeight}px)`);
      if (r.right <= vw + 1 && r.left >= -1) continue;
      let clip: DOMRect | null = null;
      for (let n = el.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        if (getComputedStyle(n).overflowX !== "visible") {
          clip = n.getBoundingClientRect();
          break;
        }
      }
      if (clip && clip.right < vw - 1 && clip.left > 1) continue;
      found.push(`${text} runs ${Math.round(Math.max(r.right - vw, -r.left))}px past the window`);
    }
    return found;
  }, scope);
}

/** Words broken across two lines (spec §9's 200% text): each word of the text in `selector`, read as a range, and any
 * whose glyphs sit on more than one line. A word longer than its whole line has to break somewhere; nothing else may. */
export async function brokenWords(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const found: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      if (!el.checkVisibility()) continue;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const value = node.textContent ?? "";
        for (const word of value.matchAll(/\S+/g)) {
          const range = document.createRange();
          range.setStart(node, word.index);
          range.setEnd(node, word.index + word[0].length);
          const lines = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
          if (lines.size > 1) found.push(`"${word[0]}" breaks across ${lines.size} lines in ${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}`);
        }
      }
    }
    return found;
  }, selector);
}
