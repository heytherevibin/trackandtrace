import type { Page } from "@playwright/test";

// The landing journey's shared collision checker (spec 2026-09-24 §5), prototype v3's in-page gate cut down to
// its general part. It measures what a person sees. Each line of text counts as its line-height band (tight
// display leading is not a collision), cut by any ancestor that clips it, below the sticky masthead and inside
// the window. Every box outside the masthead is also cut to the masthead's own bottom edge, so a line or panel
// the masthead paints over never counts as colliding with what nobody can see it touch. An overlay actually
// painted above the masthead (a sheet, dialog or popover) is cut at the same edge regardless — the checker
// only knows it isn't inside <header>, not that it is drawn on top. "Panels" are boxes that must never cover
// text outside themselves, nor each other. Findings name both parties. The journey's own checks (leader lines,
// the drawing's box, the dial ring) join this file in the PRs that draw those pieces.

export interface CollisionOptions {
  /** Boxes that must never cover text outside themselves, nor each other. */
  readonly panels?: readonly string[];
  /** Subtrees drawn under text on purpose, which the checker ignores. */
  readonly skip?: readonly string[];
}

/** Every collision in the current window: text over text, a panel over text or a panel, sideways scroll. */
export async function collisionsInView(page: Page, options: CollisionOptions = {}): Promise<string[]> {
  return page.evaluate(
    ({ panels, skip }) => {
      interface Box {
        left: number;
        right: number;
        top: number;
        bottom: number;
      }
      const masthead = document.querySelector("header");
      const mastheadBottom = masthead ? masthead.getBoundingClientRect().bottom : 0;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const ignored = [".sr-only", "noscript", "script", "style", "nextjs-portal", "[data-sonner-toaster]", ...skip].join(", ");

      /** Seen by a person: laid out, not skipped by the browser (a closed <details>' content, content-visibility), not hidden, not clipped away as screen-reader-only, not faded out. */
      const visible = (el: Element): boolean => {
        const box = el.getBoundingClientRect();
        if (box.width < 1 && box.height < 1) return false;
        if (!el.checkVisibility()) return false;
        const opacities: number[] = [];
        for (let node: Element | null = el; node && node !== document.documentElement; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === "none" || style.visibility === "hidden") return false;
          if (style.clipPath.startsWith("inset(50%") || style.clip === "rect(0px, 0px, 0px, 0px)") return false;
          if (style.overflow === "hidden" && node.clientWidth <= 1 && node.clientHeight <= 1) return false;
          opacities.push(Number(style.opacity));
        }
        return opacities.reduce((product, opacity) => product * opacity, 1) > 0.12;
      };
      /** The block a text line belongs to: lines of one paragraph share leading and never collide with each other. */
      const blockOf = (el: Element): Element => {
        for (let node: Element | null = el; node; node = node.parentElement) {
          const display = getComputedStyle(node).display;
          if (display !== "inline" && display !== "contents") return node;
        }
        return el;
      };
      /** What the ancestors that clip (a scroller, an ellipsis) leave visible. */
      const clipOf = (el: Element): Box => {
        const clip: Box = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
        for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
          const style = getComputedStyle(node);
          const box = node.getBoundingClientRect();
          if (style.overflowX !== "visible") {
            clip.left = Math.max(clip.left, box.left);
            clip.right = Math.min(clip.right, box.right);
          }
          if (style.overflowY !== "visible") {
            clip.top = Math.max(clip.top, box.top);
            clip.bottom = Math.min(clip.bottom, box.bottom);
          }
        }
        return clip;
      };
      // The masthead paints over anything below it; a box outside the masthead is cut to its bottom edge before
      // it is compared against anything, so a line or panel straddling that edge is judged only on the sliver a
      // reader can actually see. A box inside the masthead is exempt from the cut and is checked against the
      // window's top edge instead, by inView.
      // Rebuilds the box explicitly rather than spreading it: all four of a DOMRect's sides (top, right,
      // bottom, left) are getters on its prototype, not own properties, so `{ ...box }` keeps none of them.
      const belowMasthead = (box: Box, insideMasthead: boolean): Box =>
        insideMasthead ? box : { left: box.left, right: box.right, top: Math.max(box.top, mastheadBottom), bottom: box.bottom };
      const inView = (r: Box, insideMasthead: boolean) => r.right - r.left > 1 && r.bottom - r.top > 1 && r.bottom > (insideMasthead ? 0 : mastheadBottom + 2) && r.top < vh && r.right > 0 && r.left < vw;
      const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      const related = (a: Element, b: Element) => a === b || a.contains(b) || b.contains(a);
      const name = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList[0] ? `.${el.classList[0]}` : ""}`;

      const texts: { box: Box; owner: Element; block: Element; text: string }[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const owner = node.parentElement;
        const words = node.nodeValue?.trim() ?? "";
        if (!words || !owner || owner.closest(ignored)) continue;
        const insideMasthead = masthead ? masthead.contains(owner) : false;
        // Cheap first: text wholly above or below the window is never walked for visibility. Text inside the
        // masthead itself is never "above" it, so it skips this cut.
        const reach = owner.getBoundingClientRect();
        if ((!insideMasthead && reach.bottom <= mastheadBottom) || reach.top >= vh || !visible(owner)) continue;
        const style = getComputedStyle(owner);
        const size = Number.parseFloat(style.fontSize);
        const leading = style.lineHeight === "normal" ? size * 1.2 : Number.parseFloat(style.lineHeight);
        const clip = clipOf(owner);
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const line of range.getClientRects()) {
          const middle = (line.top + line.bottom) / 2;
          const half = Math.min(line.height, leading) / 2;
          const box = belowMasthead({ left: Math.max(line.left, clip.left), right: Math.min(line.right, clip.right), top: Math.max(middle - half, clip.top), bottom: Math.min(middle + half, clip.bottom) }, insideMasthead);
          if (inView(box, insideMasthead)) texts.push({ box, owner, block: blockOf(owner), text: words.slice(0, 40) });
        }
      }
      const drawn = panels.length
        ? [...document.querySelectorAll(panels.join(", "))]
            .filter((el) => !el.closest(ignored) && visible(el))
            .map((el) => {
              const insideMasthead = masthead ? masthead.contains(el) : false;
              return { el, box: belowMasthead(el.getBoundingClientRect(), insideMasthead), insideMasthead };
            })
            .filter(({ box, insideMasthead }) => inView(box, insideMasthead))
        : [];

      const found: string[] = [];
      texts.forEach((a, i) => {
        // Lines of one paragraph share a block and never collide with each other; a positioned child laid
        // over its own parent's text is a different block and is compared like any other pair.
        for (const b of texts.slice(i + 1)) if (a.block !== b.block && overlap(a.box, b.box) > 6) found.push(`text "${a.text}" × text "${b.text}"`);
      });
      for (const panel of drawn) {
        for (const t of texts) if (!panel.el.contains(t.owner) && overlap(panel.box, t.box) > 6) found.push(`panel ${name(panel.el)} × text "${t.text}"`);
      }
      drawn.forEach((a, i) => {
        for (const b of drawn.slice(i + 1)) if (!related(a.el, b.el) && overlap(a.box, b.box) > 6) found.push(`panel ${name(a.el)} × panel ${name(b.el)}`);
      });
      if (document.documentElement.scrollWidth > vw + 1) found.push(`sideways overflow ${document.documentElement.scrollWidth - vw}px`);
      return [...new Set(found)];
    },
    { panels: [...(options.panels ?? [])], skip: [...(options.skip ?? [])] },
  );
}

/** Positions visited before {@link collisionsTopToBottom} gives up on a page that never stops growing. */
const SWEEP_STEP_CAP = 400;

/** Scrolls from top to bottom in steps of 45% of the window; each finding once, with the scroll position it was seen at. */
export async function collisionsTopToBottom(page: Page, options: CollisionOptions = {}): Promise<string[]> {
  const height = await page.evaluate(() => window.innerHeight);
  const step = Math.max(1, Math.round(height * 0.45));
  const found = new Map<string, number>();
  const measureMax = () => page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  // max can grow as later sections (pinned scenes, content that settles in after a scroll) change scrollHeight,
  // so it is re-measured after every check, not just before the scroll it clamps: the sweep stops only once the
  // visited position has caught up with that freshest max, so a page that grows at its very end is still
  // covered. A page that keeps growing forever would otherwise run into the test timeout instead of failing
  // with a clear reason, so a hard step cap throws first.
  let max = await measureMax();
  let y = 0;
  for (let steps = 0; ; ) {
    if (++steps > SWEEP_STEP_CAP) throw new Error(`collisionsTopToBottom: the page kept growing past ${SWEEP_STEP_CAP} positions (last max: ${max})`);
    const at = Math.min(y, max);
    // An instant jump, then two frames: style, layout and anything that follows the scroll have settled.
    await page.evaluate(
      (top) =>
        new Promise<void>((done) => {
          window.scrollTo({ top, behavior: "instant" });
          requestAnimationFrame(() => requestAnimationFrame(() => done()));
        }),
      at,
    );
    for (const finding of await collisionsInView(page, options)) if (!found.has(finding)) found.set(finding, at);
    max = await measureMax();
    if (at >= max) break;
    // Steps from the position actually visited, not from the pre-clamp y: a clamp followed by more growth
    // must not leave an unvisited strip between the clamped position and the next step.
    y = at + step;
  }
  return [...found].map(([finding, y]) => `@${y}: ${finding}`);
}
