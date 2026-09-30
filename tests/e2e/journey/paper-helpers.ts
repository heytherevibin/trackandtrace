import type { Page } from "@playwright/test";
import { frames } from "./journey-helpers";

// The pinned stages and their paper (paper.spec.ts, paper-scrollbar.spec.ts).

export interface Stage {
  readonly section: string;
  readonly pinned: RegExp;
  readonly pin: string;
}
export const STAGES: Readonly<Record<string, Stage>> = {
  "02": { section: "#how", pinned: /is-pinned/, pin: ".chapters-pin" },
  "the drawing": { section: "#anatomy", pinned: /is-live/, pin: ".anatomy-pin" },
  "the run": { section: "#run", pinned: /is-running/, pin: ".run-pin" },
};

export interface Geometry {
  readonly scrollY: number;
  readonly vw: number;
  readonly masthead: number;
  /** 100lvh less 100svh: how far a phone's collapsing toolbar can grow the window (0 wherever the two agree). */
  readonly toolbar: number;
  readonly section: { readonly top: number; readonly bottom: number; readonly overflowY: string };
  readonly pin: { readonly top: number; readonly bottom: number };
  readonly paper: { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number; readonly display: string; readonly image: string } | null;
}

/** Scrolls so the stage's pin is `p` of the way through its pinned run (0 as it takes hold, 1 as it lets go), then `px`
 * further: a run can be short on a phone, so "before" and "after" are said in pixels. */
export async function into(page: Page, stage: Stage, p: number, px = 0): Promise<void> {
  await page.evaluate(
    ([sel, pinSel, at, by]) => {
      const section = document.querySelector<HTMLElement>(sel)!;
      const pin = section.querySelector<HTMLElement>(pinSel)!;
      const stick = Number.parseFloat(getComputedStyle(pin).top) || 0;
      const start = section.getBoundingClientRect().top + window.scrollY - stick;
      window.scrollTo({ top: start + (section.offsetHeight - pin.offsetHeight) * at + by, behavior: "instant" });
    },
    [stage.section, stage.pin, p, px] as const,
  );
  await frames(page, 3);
}

export async function geometry(page: Page, stage: Stage): Promise<Geometry> {
  return page.evaluate(
    ([sel, pinSel]) => {
      const section = document.querySelector<HTMLElement>(sel)!;
      const s = section.getBoundingClientRect();
      const p = section.querySelector<HTMLElement>(pinSel)!.getBoundingClientRect();
      const paperEl = section.querySelector<HTMLElement>(":scope > .pin-paper");
      const r = paperEl?.getBoundingClientRect();
      const style = paperEl ? getComputedStyle(paperEl) : null;
      const probe = document.createElement("div");
      probe.style.cssText = "position:absolute;visibility:hidden;width:1px;height:100lvh";
      document.body.append(probe);
      const lvh = probe.getBoundingClientRect().height;
      probe.style.height = "100svh";
      const svh = probe.getBoundingClientRect().height;
      probe.remove();
      return {
        scrollY: window.scrollY,
        vw: document.documentElement.clientWidth,
        masthead: document.querySelector("header")?.getBoundingClientRect().bottom ?? 0,
        toolbar: lvh - svh,
        section: { top: s.top, bottom: s.bottom, overflowY: getComputedStyle(section).overflowY },
        pin: { top: p.top, bottom: p.bottom },
        paper: r && style ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right, display: style.display, image: style.backgroundImage } : null,
      };
    },
    [stage.section, stage.pin] as const,
  );
}

