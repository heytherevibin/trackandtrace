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

  it("a scroll while a traverse is leaving never re-keys the place", () => {
    // Back or Forward: the destination's entry is current before the new page renders, while this page's sections
    // still stand; a scroll sampled in that window would store this page's place under that entry.
    const memory = startPlaceMemory();
    scrollY = 3000 - 40;
    nav.dispatchEvent(Object.assign(new Event("navigate"), { navigationType: "traverse" }));
    nav.currentEntry = { key: "k2" };
    scrollY = 2000 - 40;
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    memory.stop();
    expect(parsePlace(window.sessionStorage.getItem(PLACE_KEY))).toEqual({ entry: "k1", id: "record", offset: -24 });
  });

  it("samples again once the navigation it was leaving for fails", () => {
    const memory = startPlaceMemory();
    scrollY = 3000 - 40;
    nav.dispatchEvent(Object.assign(new Event("navigate"), { navigationType: "push" }));
    nav.dispatchEvent(new Event("navigateerror"));
    scrollY = 2000 - 40;
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    memory.stop();
    expect(parsePlace(window.sessionStorage.getItem(PLACE_KEY))).toEqual({ entry: "k1", id: "how", offset: -24 });
  });

  it("keeps sampling after a same-document hash change, on the entry it made", () => {
    const memory = startPlaceMemory();
    scrollY = 3000 - 40;
    nav.dispatchEvent(Object.assign(new Event("navigate"), { navigationType: "push", hashChange: true }));
    nav.currentEntry = { key: "k2" };
    scrollY = 2000 - 40;
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    memory.stop();
    expect(parsePlace(window.sessionStorage.getItem(PLACE_KEY))).toEqual({ entry: "k2", id: "how", offset: -24 });
  });

  it("restores nothing once the reader has scrolled by their own hand", () => {
    store({ entry: "k1", id: "record", offset: 136 });
    const memory = startPlaceMemory();
    window.dispatchEvent(new WheelEvent("wheel", { deltaY: 40 }));
    memory.restore();
    expect(scrolls).toEqual([]);
    memory.stop();
  });

  // What cancels the restore is the reader taking over (J6-9; the owner, 2026-09-28, amending J5-17's "any key", and
  // again on 2026-09-29): a mostly vertical wheel that is not a pinch-zoom, a finger dragging, a scroll key outside a
  // text field with no Alt, Ctrl or Meta, and Space only where it would scroll the page (a control that takes Space
  // acts instead: a button, a switch, a checkbox, a radio, a summary, a select, a field; a link does not, it scrolls), and Tab and Shift+Tab, and Alt+Tab (Safari's Option-Tab), but never Ctrl+Tab or Meta+Tab (the
  // browser's own tabs). A swipe back, Back and Forward's own keys, a tap and every other key leave it pending.
  type Act = [name: string, act: () => void];
  const wheel =
    (init: WheelEventInit) =>
    (): void => {
      window.dispatchEvent(new WheelEvent("wheel", init));
    };
  const key =
    (k: string, init: KeyboardEventInit = {}) =>
    (): void => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));
    };
  const inField =
    (tag: "input" | "textarea" | "select" | "div", k: string, editable = "") =>
    (): void => {
      const field = document.createElement(tag);
      if (tag === "div") field.setAttribute("contenteditable", editable);
      document.body.append(field);
      field.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    };
  /** A key on a focused element made from `html`: the keydown's target is the focused element. */
  const onEl =
    (html: string, k: string, init: KeyboardEventInit = {}) =>
    (): void => {
      const host = document.createElement("div");
      host.innerHTML = html;
      document.body.append(host);
      const el = host.firstElementChild;
      if (!el) throw new Error("no element");
      el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));
    };
  const cancels: Act[] = [
    ["a mostly vertical wheel", wheel({ deltaX: 12, deltaY: 40 })],
    ["a finger dragging (touchmove)", () => window.dispatchEvent(new Event("touchmove"))],
    ["ArrowUp", key("ArrowUp")],
    ["ArrowDown", key("ArrowDown")],
    ["PageUp", key("PageUp")],
    ["PageDown", key("PageDown")],
    ["Home", key("Home")],
    ["End", key("End")],
    ["Space", key(" ")],
    ["Shift+Space", key(" ", { shiftKey: true })],
    ["Space on a focused element that takes no Space (a plain div)", onEl("<div tabindex='0'></div>", " ")],
    ["Space on a heading that is not a control", onEl("<h2 tabindex='-1'>x</h2>", " ")],
    ["Space on a focused link (it scrolls the page, and does not follow the link)", onEl("<a href='/x'>x</a>", " ")],
    ["Shift+Space on a focused link", onEl("<a href='/x'>x</a>", " ", { shiftKey: true })],
    ["Space on a role=link", onEl("<span role='link' tabindex='0'></span>", " ")],
    ["Tab", key("Tab")],
    ["Shift+Tab", key("Tab", { shiftKey: true })],
    ["Alt+Tab (Safari's Option-Tab)", key("Tab", { altKey: true })],
    ["Tab on a button", onEl("<button>x</button>", "Tab")],
    ["Tab in a text field", inField("input", "Tab")],
    ["End inside a region made not editable (contenteditable=false)", inField("div", "End", "false")],
  ];
  const keeps: Act[] = [
    ["a trackpad's swipe back (a sideways wheel)", wheel({ deltaX: -60 })],
    ["a wheel as much sideways as down", wheel({ deltaX: 30, deltaY: 30 })],
    ["a pinch-zoom (ctrl+wheel)", wheel({ deltaY: 40, ctrlKey: true })],
    ["a tap (touchstart alone)", () => window.dispatchEvent(new Event("touchstart"))],
    ["the a key", key("a")],
    ["Ctrl+Tab (the browser's tabs)", key("Tab", { ctrlKey: true })],
    ["Meta+Tab", key("Tab", { metaKey: true })],
    ["Ctrl+Shift+Tab", key("Tab", { ctrlKey: true, shiftKey: true })],
    ["Space on a button", onEl("<button>x</button>", " ")],
    ["Shift+Space on a button", onEl("<button>x</button>", " ", { shiftKey: true })],
    ["Space on a switch (role=switch)", onEl("<span role='switch' tabindex='0' aria-checked='false'></span>", " ")],
    ["Space on a checkbox", onEl("<input type='checkbox'>", " ")],
    ["Space on a radio", onEl("<input type='radio'>", " ")],
    ["Space on a summary", onEl("<summary>x</summary>", " ")],
    ["Space on a role=button", onEl("<div role='button' tabindex='0'></div>", " ")],
    ["Space on a role=checkbox", onEl("<div role='checkbox' tabindex='0'></div>", " ")],
    ["Space on a role=tab", onEl("<div role='tab' tabindex='0'></div>", " ")],
    ["Space on a control's inner span (a button's label)", () => {
      const host = document.createElement("div");
      host.innerHTML = "<button><span>x</span></button>";
      document.body.append(host);
      host.querySelector("span")?.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    }],
    ["Space in a select", inField("select", " ")],
    ["Shift", key("Shift")],
    ["Escape", key("Escape")],
    ["ArrowLeft", key("ArrowLeft")],
    ["ArrowRight", key("ArrowRight")],
    ["Alt+ArrowLeft (Back)", key("ArrowLeft", { altKey: true })],
    ["Meta+[ (Back)", key("[", { metaKey: true })],
    ["Alt+ArrowDown", key("ArrowDown", { altKey: true })],
    ["Ctrl+End", key("End", { ctrlKey: true })],
    ["Meta+ArrowUp", key("ArrowUp", { metaKey: true })],
    ["ArrowDown in a text input", inField("input", "ArrowDown")],
    ["Space in a textarea", inField("textarea", " ")],
    ["End in an editable region", inField("div", "End")],
    ["ArrowDown on a select (it picks an option)", inField("select", "ArrowDown")],
  ];

  it.each(cancels)("restores nothing once the reader scrolls by their own hand: %s", (_, act) => {
    store({ entry: "k1", id: "record", offset: 136 });
    const memory = startPlaceMemory();
    act();
    memory.restore();
    expect(scrolls).toEqual([]);
    memory.stop();
  });

  it.each(keeps)("still restores after what is not the reader's own scroll: %s", (_, act) => {
    store({ entry: "k1", id: "record", offset: 136 });
    const memory = startPlaceMemory();
    act();
    memory.restore();
    expect(scrolls).toEqual([3000 - 64 - 136]);
    memory.stop();
  });

  it("stops listening when stopped", () => {
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const removeNav = vi.spyOn(nav, "removeEventListener");
    startPlaceMemory().stop();
    expect(removeWindow.mock.calls.map((c) => c[0])).toContain("scroll");
    expect(removeNav.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["navigate", "navigateerror"]));
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

  // The window-seat run (J6-9): #features and #use ride it inside one pin, so their boxes stand together, far from
  // where their words come to the window. run.ts writes where each would stand (data-run-at), as station-progress reads.
  const ride = () => {
    document.body.insertAdjacentHTML("beforeend", `<section id="features" data-run-at="3600"></section><section id="use" data-run-at="4600"></section>`);
    for (const id of ["features", "use"]) document.getElementById(id)!.getBoundingClientRect = () => ({ top: 3600 - scrollY }) as DOMRect;
  };

  it("reads a section riding the run where run.ts says it stands, not at the pinned box it shares", () => {
    ride();
    const memory = startPlaceMemory();
    scrollY = 4600 - 40; // 07's top 40px down the window, 24px above the masthead's foot
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    memory.stop();
    expect(parsePlace(window.sessionStorage.getItem(PLACE_KEY))).toEqual({ entry: "k1", id: "use", offset: -24 });
  });

  it("restores a place in the run where run.ts says it stands", () => {
    ride();
    store({ entry: "k1", id: "use", offset: -24 });
    const memory = startPlaceMemory();
    memory.restore();
    expect(scrolls).toEqual([4600 - 64 + 24]);
    memory.stop();
  });
});
