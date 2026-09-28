import type { Page } from "@playwright/test";

/** Describes everything that breaks the phone layout on the current page; empty when it fits. */
export async function layoutBreaks(page: Page): Promise<string[]> {
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

/** Words a reader cannot read to the end (spec §9's 200% text; J6 nightly): a line of text that runs past the window's
 * side where the page clips it (the sideways overflow the collision checker sees is the page scrolling instead), or
 * text its own box cuts off inside the page (overflow hidden or clipped, an ellipsis). Clipped inside the page on
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
