import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drawingModule, type Begin } from "@/components/landing/journey/drawing";
import { modality, pressTab } from "./focus-glide-rig";
import { testContext } from "./journey-context";

// A Tab's glide, like an in-page link's, starts a frame after the focus that asks for it: the page counts as moving from
// that focus, so the live drawing never pins under a glide whose end the browser has already set (the #94 review's root
// cause). Only a real Tab (focus-glide.ts's watchTab: never Ctrl or Meta) that gives keyboard focus (:focus-visible) to
// something outside the window, where the browser glides; a Tab onto something in view, or a mouse's focus, moves nothing.

const html = document.documentElement;
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  html.dataset.drawing = "live";
  html.dataset.saver = "off";
  vi.spyOn(window, "innerHeight", "get").mockReturnValue(900);
  document.body.innerHTML = `<header></header><section id="anatomy"></section><section id="reliability"><a href="/accuracy">Read the data policy</a></section>`;
  const section = document.getElementById("anatomy")!;
  section.getBoundingClientRect = () => ({ top: 200, bottom: 5200, height: 5000 }) as DOMRect; // the reader above it
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete html.dataset.drawing;
  delete html.dataset.drawingWhy;
  delete html.dataset.saver;
  window.sessionStorage.clear();
  document.body.innerHTML = "";
});

/** 04's link, at `top` in the window. */
const link = (top: number) => {
  const a = document.querySelector<HTMLAnchorElement>("#reliability a")!;
  a.getBoundingClientRect = () => ({ top, bottom: top + 32, height: 32 }) as DOMRect;
  return a;
};
/** A drawing whose scene is on its way: `arrive` hands it the begin, with the pin pending. */
const pending = () => {
  let arrive: (b: Begin) => void = () => {};
  const begin = vi.fn<Begin>(() => () => undefined);
  const stop = drawingModule(() => new Promise<Begin>((resolve) => (arrive = resolve)), () => true)(testContext());
  return { begin, stop, arrive: () => arrive(begin), pinned: () => document.getElementById("anatomy")!.classList.contains("is-live") };
};
/** Focus as the keyboard or a mouse gives it, after a keydown of Tab (with `mods`) or none. */
const focusBy = (el: HTMLElement, how: { tab: boolean; keyboard: boolean; mods?: KeyboardEventInit }) => {
  modality(el, how.keyboard);
  if (how.tab) {
    if (how.mods) window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", ...how.mods }));
    else pressTab();
  }
  el.focus();
};

describe("a Tab's glide holds the pin, as an in-page link's does", () => {
  it("holds the pin from a Tab's keyboard focus on something below the window, until scrollend, then pins", async () => {
    const d = pending();
    focusBy(link(1400), { tab: true, keyboard: true }); // the glide starts a frame later
    d.arrive();
    await flush();
    expect(d.begin).not.toHaveBeenCalled();
    expect(d.pinned()).toBe(false);
    window.dispatchEvent(new Event("scroll")); // the glide, which stays above the chapter here
    window.dispatchEvent(new Event("scrollend"));
    await flush();
    expect(d.begin).toHaveBeenCalledTimes(1);
    expect(d.pinned()).toBe(true);
    d.stop();
  });

  it("holds it for Shift+Tab onto something above the window, and Alt+Tab (Safari's), until the quiet time, then pins", async () => {
    for (const mods of [{ shiftKey: true }, { altKey: true }]) {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const d = pending();
      focusBy(link(mods.shiftKey ? -400 : 1400), { tab: true, keyboard: true, mods });
      d.arrive();
      await vi.advanceTimersByTimeAsync(0);
      expect(d.begin).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000); // no scrollend: the quiet time says the glide is over
      expect(d.begin).toHaveBeenCalledTimes(1);
      expect(d.pinned()).toBe(true);
      d.stop();
      vi.useRealTimers();
      document.getElementById("anatomy")!.classList.remove("is-live");
      (document.activeElement as HTMLElement | null)?.blur();
    }
  });

  it("does not wait for a Tab onto something already in the window: it scrolls nothing", async () => {
    const d = pending();
    focusBy(link(400), { tab: true, keyboard: true });
    d.arrive();
    await flush();
    expect(d.begin).toHaveBeenCalledTimes(1);
    expect(d.pinned()).toBe(true);
    d.stop();
  });

  it("does not wait for a mouse's focus, which starts no glide", async () => {
    const d = pending();
    focusBy(link(1400), { tab: false, keyboard: false });
    d.arrive();
    await flush();
    expect(d.begin).toHaveBeenCalledTimes(1);
    d.stop();
  });

  it("does not wait for keyboard focus that no Tab moved (focus returning to the window)", async () => {
    const d = pending();
    focusBy(link(1400), { tab: false, keyboard: true });
    d.arrive();
    await flush();
    expect(d.begin).toHaveBeenCalledTimes(1);
    d.stop();
  });

  it("does not wait for Ctrl+Tab or Cmd+Tab, which move between the browser's tabs or the system's apps", async () => {
    for (const mods of [{ ctrlKey: true }, { metaKey: true }]) {
      const d = pending();
      focusBy(link(1400), { tab: true, keyboard: true, mods });
      d.arrive();
      await flush();
      expect(d.begin).toHaveBeenCalledTimes(1);
      d.stop();
      (document.activeElement as HTMLElement | null)?.blur();
    }
  });

  it("stops listening for the Tab and its focus on teardown", () => {
    const onWindow = vi.spyOn(window, "removeEventListener");
    const onDocument = vi.spyOn(document, "removeEventListener");
    pending().stop();
    expect(onWindow.mock.calls.some(([type]) => type === "keydown")).toBe(true);
    expect(onDocument.mock.calls.some(([type]) => type === "focusin")).toBe(true);
  });
});
