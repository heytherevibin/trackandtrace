import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLACE_KEY, parsePlace, pickPlace, startPlaceMemory } from "@/components/landing/journey/place-memory";

// Back to "/" restores the reader's section, not the raw scrollY the browser saved while #how was pinned.

describe("parsePlace", () => {
  it("reads a whole place back", () => {
    expect(parsePlace(JSON.stringify({ entry: "k1", id: "record", offset: 136 }))).toEqual({ entry: "k1", id: "record", offset: 136 });
  });
  it("refuses anything else: nothing stored, bad JSON, an unknown section, a missing or non-finite number", () => {
    for (const raw of [null, "", "{", "[]", "null", '{"entry":"k1","id":"nowhere","offset":0}', '{"entry":"k1","id":"record"}', '{"entry":1,"id":"record","offset":0}', '{"entry":"","id":"record","offset":0}', '{"entry":"k1","id":"record","offset":"9"}']) {
      expect(parsePlace(raw), String(raw)).toBeNull();
    }
    expect(parsePlace(JSON.stringify({ entry: "k1", id: "record", offset: Number.POSITIVE_INFINITY }))).toBeNull();
  });
});

describe("pickPlace", () => {
  it("anchors on the section edge nearest the masthead's foot, measured from that foot", () => {
    // left at #record under a pinned 02: #how's top is far above, and #how is the one section whose height the
    // return changes, so it must never be the anchor while a nearer edge exists
    const tops = [
      { id: "anatomy", top: -4000 },
      { id: "how", top: -2866 },
      { id: "record", top: 200 },
      { id: "faq", top: 1400 },
    ];
    expect(pickPlace(tops, 64)).toEqual({ id: "record", offset: 136 });
    expect(pickPlace([{ id: "how", top: -300 }, { id: "record", top: 900 }], 64)).toEqual({ id: "how", offset: -364 });
    expect(pickPlace([{ id: "anatomy", top: 500 }, { id: "how", top: 900 }], 64)).toEqual({ id: "anatomy", offset: 436 });
  });
  it("is nothing when there are no sections", () => {
    expect(pickPlace([], 64)).toBeNull();
  });
});

type Rects = Record<string, number>;

describe("startPlaceMemory", () => {
  const nav = Object.assign(new EventTarget(), { currentEntry: { key: "k1" } as { key: string } | null });
  let scrollY = 0;
  const scrolls: number[] = [];
  let rects: Rects = {};

  const mount = () => {
    document.body.innerHTML = `<header></header><section id="anatomy"></section><section id="how"></section><section id="record"></section>`;
    const header = document.querySelector("header")!;
    header.getBoundingClientRect = () => ({ bottom: 64 }) as DOMRect;
    for (const el of document.querySelectorAll("section")) el.getBoundingClientRect = () => ({ top: (rects[el.id] ?? 0) - scrollY }) as DOMRect;
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    Object.defineProperty(window, "navigation", { configurable: true, value: nav });
    nav.currentEntry = { key: "k1" };
    scrollY = 0;
    scrolls.length = 0;
    Object.defineProperty(window, "scrollY", { configurable: true, get: () => scrollY });
    vi.spyOn(window, "scrollTo").mockImplementation(((opts: ScrollToOptions) => {
      scrollY = opts.top ?? scrollY;
      scrolls.push(scrollY);
    }) as typeof window.scrollTo);
    // document coordinates: the page as the server drew it, #how unpinned
    rects = { anatomy: 800, how: 2000, record: 3000 };
    window.sessionStorage.clear();
    mount();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "navigation");
    window.location.hash = "";
    document.body.replaceChildren();
  });

  const store = (place: object) => window.sessionStorage.setItem(PLACE_KEY, JSON.stringify(place));

  it("on a return to the entry it was stored for, stands the section at its old offset, then forgets it", () => {
    store({ entry: "k1", id: "record", offset: 136 });
    const memory = startPlaceMemory();
    expect(window.sessionStorage.getItem(PLACE_KEY)).toBeNull();
    memory.restore();
    expect(scrolls).toEqual([3000 - 64 - 136]);
    memory.restore();
    expect(scrolls).toHaveLength(1);
    memory.stop();
  });

  it("restores nothing on another entry (a new visit, a link, a hash landing), and still forgets the stale place", () => {
    store({ entry: "k0", id: "record", offset: 136 });
    const memory = startPlaceMemory();
    memory.restore();
    expect(scrolls).toEqual([]);
    expect(window.sessionStorage.getItem(PLACE_KEY)).toBeNull();
    memory.stop();
  });

  it("restores nothing where the browser cannot name its history entry", () => {
    nav.currentEntry = null;
    store({ entry: "k1", id: "record", offset: 136 });
    const memory = startPlaceMemory();
    memory.restore();
    expect(scrolls).toEqual([]);
    memory.stop();
  });

  it("on leaving, stores the section the reader last stood on, with this entry's key", () => {
    const memory = startPlaceMemory();
    scrollY = 3000 - 40;
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    memory.stop();
    expect(parsePlace(window.sessionStorage.getItem(PLACE_KEY))).toEqual({ entry: "k1", id: "record", offset: -24 });
  });

  it("samples as a navigation starts, and keeps that place once the page's sections are gone", () => {
    const memory = startPlaceMemory();
    scrollY = 2000 - 40;
    nav.dispatchEvent(Object.assign(new Event("navigate"), { navigationType: "push" }));
    document.body.replaceChildren(); // the new page has replaced this one's markup
    scrollY = 0;
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    memory.stop();
    expect(parsePlace(window.sessionStorage.getItem(PLACE_KEY))).toEqual({ entry: "k1", id: "how", offset: -24 });
  });

  it("never samples on a click alone, nor on a reload", () => {
    const memory = startPlaceMemory();
    scrollY = 2000 - 40;
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    nav.dispatchEvent(Object.assign(new Event("navigate"), { navigationType: "reload" }));
    document.body.replaceChildren();
    memory.stop();
    expect(parsePlace(window.sessionStorage.getItem(PLACE_KEY))?.id).toBe("anatomy"); // the first sample, at the top
  });

  it("a replace after a traverse never changes the stored key or place", () => {
    // Forward: the traverse is sampled on this entry; then the router's own same-URL replace lands with the
    // destination already current while this page's sections still stand. A replace overwrites its own entry, so
    // Back can never return to it: it must not re-key the place.
    const memory = startPlaceMemory();
    scrollY = 3000 - 40;
    nav.dispatchEvent(Object.assign(new Event("navigate"), { navigationType: "traverse" }));
    nav.currentEntry = { key: "k2" };
    scrollY = 2000 - 40;
    nav.dispatchEvent(Object.assign(new Event("navigate"), { navigationType: "replace" }));
    document.body.replaceChildren();
    memory.stop();
    expect(parsePlace(window.sessionStorage.getItem(PLACE_KEY))).toEqual({ entry: "k1", id: "record", offset: -24 });
  });

  it("restores nothing once the reader has scrolled by their own hand", () => {
    store({ entry: "k1", id: "record", offset: 136 });
    const memory = startPlaceMemory();
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 40 }));
    memory.restore();
    expect(scrolls).toEqual([]);
    memory.stop();
  });

  it("stops listening when stopped", () => {
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const removeNav = vi.spyOn(nav, "removeEventListener");
    startPlaceMemory().stop();
    expect(removeWindow.mock.calls.map((c) => c[0])).toContain("scroll");
    expect(removeNav.mock.calls.map((c) => c[0])).toContain("navigate");
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const memory = startPlaceMemory();
    memory.restore();
    expect(() => memory.stop()).not.toThrow();
  });
});
