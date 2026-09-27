import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startFocusGlide } from "@/components/landing/journey/focus-glide";
import { LAYOUT_EVENT } from "@/components/landing/journey/journey-events";
import { testContext } from "./journey-context";

// The browser glides a Tab stop into the window, and an instant scroll that keeps the reader's place (keepPlace, the
// still's settle: the drawing falling to the still under load) cancels that glide, stranding focus off-screen at rest
// (WCAG 2.4.11). After a layout change the glide is taken up again, while focus is still there and the reader has not
// scrolled by their own hand.

const reveal = vi.fn();
let box = { top: 1400, bottom: 1432 }; // below a 900px window

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(900);
  document.body.innerHTML = `<header></header><section id="reliability"><a href="/accuracy">Read the data policy</a></section><div id="run" class="run is-running"><section id="features"><article data-station=""><a href="/watchlist">Open Watchlist</a></article></section></div>`;
  document.querySelector("header")!.getBoundingClientRect = () => ({ bottom: 64 }) as DOMRect;
  box = { top: 1400, bottom: 1432 };
  for (const a of document.querySelectorAll("a")) {
    a.getBoundingClientRect = () => box as DOMRect;
    a.scrollIntoView = reveal;
  }
  reveal.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const policy = () => document.querySelector<HTMLAnchorElement>("#reliability a")!;
const refocus = () => {
  policy().blur();
  policy().focus();
};
const layout = () => {
  window.dispatchEvent(new Event(LAYOUT_EVENT));
  vi.advanceTimersToNextFrame();
};

describe("a Tab stop's glide, cut short", () => {
  it("is taken up again after a layout change, centred so the masthead never covers it", () => {
    const stop = startFocusGlide(testContext());
    policy().focus();
    layout();
    expect(reveal).toHaveBeenCalledWith({ block: "center", inline: "nearest" });
    stop();
  });

  it("is left alone once the focused element stands in the window", () => {
    const stop = startFocusGlide(testContext());
    policy().focus();
    box = { top: 400, bottom: 432 };
    layout();
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("is let go once the glide has landed, the reader scrolls by their own hand, or focus moves on", () => {
    const stop = startFocusGlide(testContext());
    policy().focus();
    box = { top: 400, bottom: 432 };
    window.dispatchEvent(new Event("scrollend")); // landed
    box = { top: 1400, bottom: 1432 }; // then the page moves under the reader, not by a glide
    layout();
    refocus();
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 120 }));
    layout();
    refocus();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown" }));
    layout();
    refocus();
    policy().blur();
    layout();
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("is not taken up by the next key that is not a scroll (Tab itself)", () => {
    const stop = startFocusGlide(testContext());
    policy().focus();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    layout();
    expect(reveal).toHaveBeenCalledTimes(1);
    stop();
  });

  it("takes up only a glide the browser began: a Tab stop already in the viewport is not scrolled for", () => {
    const stop = startFocusGlide(testContext());
    box = { top: 40, bottom: 72 }; // in the viewport, if under the masthead: the browser does not scroll for it
    policy().focus();
    layout();
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("leaves a station of the running window-seat run to run.ts, which brings it to the window sideways", () => {
    const stop = startFocusGlide(testContext());
    document.querySelector<HTMLAnchorElement>("#run a")!.focus();
    layout();
    expect(reveal).not.toHaveBeenCalled();
    stop();
  });

  it("does nothing with Motion off, where nothing glides, and stops listening on teardown", () => {
    const off = startFocusGlide(testContext({ motion: false }));
    policy().focus();
    layout();
    off();
    policy().blur();
    const stop = startFocusGlide(testContext());
    stop();
    policy().focus();
    layout();
    expect(reveal).not.toHaveBeenCalled();
  });
});
