import { afterEach, beforeEach, vi } from "vitest";
import { JUMP_EVENT, LAYOUT_EVENT } from "@/components/landing/journey/journey-events";

// focus-glide's unit rig, shared by focus-glide.test.tsx and focus-glide-relayout.test.tsx: a 900px window under a 64px
// masthead, 04's link on the page (`at.box`) and the page's scroll (`at.y`), and the browser's reveal as a mock.

export const reveal = vi.fn();
/** The link's place on the page (below a 900px window at the top), and the page's scroll. */
export const at = { box: { top: 1400, bottom: 1432 }, y: 0 };

/** Registers the rig's setup and teardown around each test of the calling file. */
export function setUpGlideRig(): void {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(900);
    at.y = 0;
    vi.spyOn(window, "scrollY", "get").mockImplementation(() => at.y);
    document.body.innerHTML = `<header></header><section id="reliability"><a href="/accuracy">Read the data policy</a></section><div id="run" class="run is-running"><section id="features"><article data-station=""><a href="/watchlist">Open Watchlist</a></article></section></div>`;
    document.querySelector("header")!.getBoundingClientRect = () => ({ bottom: 64 }) as DOMRect;
    at.box = { top: 1400, bottom: 1432 };
    for (const a of document.querySelectorAll("a")) {
      a.getBoundingClientRect = () => ({ top: at.box.top - at.y, bottom: at.box.bottom - at.y }) as DOMRect; // in the window, as scrolled
      a.scrollIntoView = reveal;
    }
    reveal.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });
}

export const policy = () => document.querySelector<HTMLAnchorElement>("#reliability a")!;
export const frames = (n: number) => {
  for (let k = 0; k < n; k += 1) vi.advanceTimersToNextFrame();
};
/** The browser's glide: a scroll step, each frame. */
export const glide = (by = 40) => {
  at.y += by;
  window.dispatchEvent(new Event("scroll"));
};
/** Focus as the keyboard gives it (:focus-visible), or as a mouse does: said outright, since jsdom's own modality guess
 * carries from test to test. */
export const modality = (el: HTMLElement, keyboard: boolean) => {
  const own = Element.prototype.matches.bind(el);
  vi.spyOn(el, "matches").mockImplementation((selector: string) => (selector === ":focus-visible" ? keyboard : own(selector)));
};
/** A Tab keydown: the focus it moves comes in the same task. */
export const pressTab = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
/** Focus that starts the browser's glide: a Tab's (:focus-visible), unless said otherwise (a mouse's, with no Tab). */
export const tabOnto = (el: HTMLElement, keyboard = true) => {
  modality(el, keyboard);
  if (keyboard) pressTab();
  el.focus();
  glide();
  frames(1);
};
/** A place-keeping jump, as the drawing falls to the still: it cuts the glide, and the page's layout changes. */
export const jump = () => {
  window.dispatchEvent(new Event(JUMP_EVENT));
  window.dispatchEvent(new Event(LAYOUT_EVENT));
};
/** A relayout between the reader and the link (the live drawing pinning, a late font, a resize): the link moves `by` down
 * the page, and the page says so, as tt:layout or as the window's resize. */
export const relayout = (by = 2400, type: string = LAYOUT_EVENT) => {
  at.box = { top: at.box.top + by, bottom: at.box.bottom + by };
  window.dispatchEvent(new Event(type));
};
