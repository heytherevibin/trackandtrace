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

/** What a little more scroll did to a pinned stage: how far the page moved under it as the scroll landed, and the
 * farthest its pin and its paper stood from where they were, in the task that made the scroll and in every frame after
 * it until the page had held still for twenty. */
export interface Nudge {
  readonly moved: number;
  readonly pin: number;
  readonly paper: number;
  /** Every frame watched found the stage pinned. */
  readonly pinned: boolean;
  readonly frames: number;
}

/** Scrolls `by` px on, instantly, and watches the stage from that task on. The page's move is read as the scroll lands,
 * in the same task, because what comes after is the browser's own: on a touch screen each station of the run is a
 * resting point (scroll snap, run.ts's marks), and Chromium glides the page back to the one it left, beginning 2 to 10
 * frames later and over about 8. A read three frames on met that glide part-way in 6 runs in 120 (the page 9, 10 or
 * 19 px on, not 24), and at rest the page is back where it began in every run. The pin and the paper are read in every
 * frame, through that glide, so a sheet that moved for one frame would be seen. */
export async function nudge(page: Page, stage: Stage, by: number): Promise<Nudge> {
  return page.evaluate(
    ([sel, pinSel, pinnedAs, px]) =>
      new Promise<Nudge>((done) => {
        const section = document.querySelector<HTMLElement>(sel)!;
        const pin = section.querySelector<HTMLElement>(pinSel)!;
        const paper = section.querySelector<HTMLElement>(":scope > .pin-paper")!;
        const pinnedNow = new RegExp(pinnedAs);
        const read = () => ({ y: window.scrollY, section: section.getBoundingClientRect().top, pin: pin.getBoundingClientRect().top, paper: paper.getBoundingClientRect().top, pinned: pinnedNow.test(section.className) });
        const before = read();
        window.scrollBy({ top: px, behavior: "instant" });
        const landed = read();
        const off = { pin: Math.abs(landed.pin - before.pin), paper: Math.abs(landed.paper - before.paper), pinned: before.pinned && landed.pinned };
        let last = landed.y;
        let still = 0;
        let frames = 0;
        const tick = () => {
          const now = read();
          frames += 1;
          off.pin = Math.max(off.pin, Math.abs(now.pin - before.pin));
          off.paper = Math.max(off.paper, Math.abs(now.paper - before.paper));
          off.pinned = off.pinned && now.pinned;
          still = now.y === last ? still + 1 : 0;
          last = now.y;
          if (still >= 20 || frames >= 600) done({ moved: before.section - landed.section, ...off, frames });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    [stage.section, stage.pin, stage.pinned.source, by] as const,
  );
}
