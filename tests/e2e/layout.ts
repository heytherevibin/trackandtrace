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
