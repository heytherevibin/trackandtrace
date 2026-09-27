import { animate, splitText, stagger, svg } from "animejs";
import { ease } from "./ease";
import { STAGGER, T } from "./motion-tokens";
import type { Teardown } from "./start-journey";

// Once per visit (spec §3.A): the plotter draws the masthead rule and the outlines of the hero plate and the
// board, their registration marks snap on, and the headline's letters rise. Every drawn overlay is removed and
// every split reverted when it lands, so the page is the server's again.

export const INTRO_KEY = "tt.intro";
const NS = "http://www.w3.org/2000/svg";

/** Motion on, the reader at the top, and not yet this visit. */
export function introWanted(motion: boolean): boolean {
  if (!motion || window.scrollY >= 40) return false;
  try {
    return window.sessionStorage.getItem(INTRO_KEY) !== "1";
  } catch {
    return true; // storage refused: the intro may replay next time, which is harmless
  }
}

function markSeen(): void {
  try {
    window.sessionStorage.setItem(INTRO_KEY, "1");
  } catch {
    // as above
  }
}

type Undo = () => void;

function plotRule(header: HTMLElement): Undo {
  const rule = document.createElement("span");
  rule.className = "intro-rule";
  rule.setAttribute("aria-hidden", "true");
  header.append(rule);
  header.classList.add("is-plotting");
  const undo = () => {
    header.classList.remove("is-plotting");
    rule.remove();
  };
  const a = animate(rule, { scaleX: [0, 1], duration: T.slow, ease: ease.expo(), onComplete: undo });
  return () => {
    a.revert();
    undo();
  };
}

function plotPlate(plate: HTMLElement, delay: number): Undo {
  const box = plate.getBoundingClientRect();
  const outline = document.createElementNS(NS, "svg");
  outline.setAttribute("class", "intro-outline");
  outline.setAttribute("aria-hidden", "true");
  outline.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
  const rect = document.createElementNS(NS, "rect");
  rect.setAttribute("x", "0.5");
  rect.setAttribute("y", "0.5");
  rect.setAttribute("width", String(Math.max(0, box.width - 1)));
  rect.setAttribute("height", String(Math.max(0, box.height - 1)));
  outline.append(rect);
  plate.append(outline);
  plate.classList.add("is-plotting");
  const undo = () => {
    plate.classList.remove("is-plotting");
    outline.remove();
  };
  const draw = animate(svg.createDrawable(rect), { draw: ["0 0", "0 1"], duration: T.draw, delay, ease: ease.inOut(), onComplete: undo });
  const corners = [...plate.querySelectorAll<HTMLElement>(":scope > .corner")];
  const snap = corners.length
    ? animate(corners, { scale: [2.2, 1], opacity: [0, 1], duration: T.base, delay: stagger(STAGGER.row, { start: delay + T.draw * 0.6 }), ease: ease.expo() })
    : null;
  return () => {
    draw.revert();
    snap?.revert();
    undo();
  };
}

function riseHeadline(h1: HTMLElement): Undo {
  const split = splitText(h1, { chars: true });
  let reverted = false;
  const unsplit = () => {
    if (reverted) return;
    reverted = true;
    split.revert();
  };
  const letters = animate(split.chars, {
    translateY: [14, 0],
    duration: T.slow,
    delay: stagger(STAGGER.char, { start: 100 }),
    ease: ease.expo(),
    onComplete: () => window.setTimeout(unsplit, 0),
  });
  const lead = h1.nextElementSibling;
  const tags = lead?.nextElementSibling ? [...lead.nextElementSibling.children] : [];
  const rest = [lead, ...tags].filter((el): el is Element => el !== null);
  const follow = rest.length ? animate(rest, { translateY: [8, 0], duration: T.slow, delay: stagger(STAGGER.row, { start: 420 }), ease: ease.expo() }) : null;
  return () => {
    letters.revert();
    follow?.revert();
    unsplit();
  };
}

export function startIntro(): Teardown {
  markSeen();
  const undo: Undo[] = [];
  const header = document.querySelector<HTMLElement>("header");
  if (header) undo.push(plotRule(header));
  const hero = document.querySelector<HTMLElement>('[data-testid="hero-instrument"]');
  if (hero) undo.push(plotPlate(hero, 120));
  const board = document.querySelector<HTMLElement>("#departures .board");
  if (board && board.getBoundingClientRect().top < window.innerHeight) undo.push(plotPlate(board, 320));
  const h1 = document.querySelector<HTMLElement>("#hero-title");
  if (h1) undo.push(riseHeadline(h1));
  return () => {
    for (const u of undo.reverse()) u();
  };
}
