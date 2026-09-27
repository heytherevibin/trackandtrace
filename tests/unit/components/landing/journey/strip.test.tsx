import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAYOUT_EVENT, STATION_EVENT, type ResultDetail } from "@/components/landing/journey/journey-events";
import { keep } from "@/components/landing/journey/start-journey";
import { STATIONS } from "@/components/landing/journey/stations";
import { startStrip } from "@/components/landing/journey/strip";

// The rail's train runs down the rail and the phone's along its hairline, both placed on every scroll frame, so
// that frame only writes: the sizes they are placed by are read on layout (the build, tt:layout, a resize),
// never between one train's write and the next train's read.

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

const context = (motion: boolean) => ({ motion, intro: false, result: keep<ResultDetail | null>(null), still: keep({ columns: false, height: null }) });

interface Sizes {
  /** The rail's track height, px. */
  rail: number;
  /** The phone rail's width, px. */
  phone: number;
}

function mount(sizes: Sizes = { rail: 495, phone: 1000 }) {
  const stops = STATIONS.map((s) => `<li><a href="#${s.id}">${s.code}</a></li>`).join("");
  const sections = STATIONS.map((s) => `<section id="${s.id}"></section>`).join("");
  document.body.innerHTML = `<header><div class="phone-rail"><span class="strip-train"><span class="strip-glyph"></span></span></div></header><nav id="route-strip"><div class="strip-track"><ol class="strip-stops">${stops}</ol><span class="strip-train"><span class="strip-glyph"></span></span></div><span class="strip-odo"></span></nav>${sections}`;
  const reads = vi.fn();
  const read = <T,>(el: Element, prop: string, value: () => T) => Object.defineProperty(el, prop, { configurable: true, get: () => (reads(prop), value()) });
  const phone = document.querySelector<HTMLElement>(".phone-rail .strip-train")!;
  read(phone, "offsetParent", () => phone.parentElement);
  read(phone, "offsetWidth", () => 40);
  read(phone.parentElement!, "clientWidth", () => sizes.phone);
  const train = document.querySelector<HTMLElement>("#route-strip .strip-train")!;
  read(train, "offsetHeight", () => 30);
  read(train.parentElement!, "clientHeight", () => sizes.rail);
  for (const li of document.querySelectorAll(".strip-stops li")) read(li, "offsetHeight", () => Math.min(44, sizes.rail / 11));
  return { reads, train, phone };
}

// tests/setup.ts installs jsdom's ResizeObserver stub before each test, so it is saved there, not at import.
const saved: { observer?: typeof ResizeObserver } = {};
beforeEach(() => {
  saved.observer = window.ResizeObserver;
});
afterEach(() => {
  if (saved.observer) window.ResizeObserver = saved.observer;
  document.body.replaceChildren();
  Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
});

describe("the rail's train", () => {
  it("stands on DEP at the rail's top, moved by transform alone, from sizes measured on layout, never read in the scroll frame", async () => {
    const { reads, train, phone } = mount();
    const stop = startStrip(context(false));
    expect(reads).toHaveBeenCalled();
    // DEP's centre is half a 44px stop down: the 30px glyph's top at 7px.
    expect(train.style.transform).toBe("translateY(7.00px)");
    expect(train.style.top).toBe("");
    expect(train.style.left).toBe("");
    // The phone's train is clamped at DEP by half its measured glyph: 20 / 1000.
    expect(phone.style.left).toBe("2%");

    reads.mockClear();
    window.dispatchEvent(new Event("scroll"));
    await frame();
    await frame();
    expect(reads).not.toHaveBeenCalled();
    expect(train.style.transform).toBe("translateY(7.00px)");

    window.dispatchEvent(new Event(LAYOUT_EVENT));
    expect(reads).toHaveBeenCalled();
    stop();
    expect(train.style.transform).toBe("");
    expect(phone.style.left).toBe("");
  });

  it("runs down the rail as the page scrolls, reaching END's stop at the foot, and marks the station it has reached", () => {
    const { train } = mount();
    const reached: number[] = [];
    const heard = (e: Event) => reached.push((e as CustomEvent<{ index: number }>).detail.index);
    window.addEventListener(STATION_EVENT, heard);
    const stop = startStrip(context(false));
    Object.defineProperty(window, "scrollY", { configurable: true, value: 1e6 });
    window.dispatchEvent(new Event(LAYOUT_EVENT));
    // END's centre is half a stop above the track's foot: 495 - 22 - 15.
    expect(train.style.transform).toBe("translateY(458.00px)");
    expect(document.querySelectorAll('.strip-stops a[aria-current="location"]')).toHaveLength(1);
    expect(document.querySelector<HTMLAnchorElement>('.strip-stops li:last-child a')).toHaveAttribute("aria-current", "location");
    expect(reached.at(-1)).toBe(STATIONS.length - 1);
    window.removeEventListener(STATION_EVENT, heard);
    stop();
    expect(document.querySelectorAll(".strip-stops a[aria-current]")).toHaveLength(0);
  });

  it("is placed again when its track changes height (the window, the fonts), from sizes read after layout", () => {
    const sized: (() => void)[] = [];
    const observed = new Set<Element>();
    window.ResizeObserver = class {
      constructor(callback: () => void) {
        sized.push(callback);
      }
      observe(el: Element): void {
        observed.add(el);
      }
      unobserve(): void {}
      disconnect(): void {
        observed.clear();
      }
    } as unknown as typeof ResizeObserver;
    const sizes = { rail: 495, phone: 1000 };
    const { train, phone } = mount(sizes);
    const stop = startStrip(context(false));
    expect(observed.has(train.parentElement!)).toBe(true);
    expect(observed.has(phone.parentElement!)).toBe(true);

    Object.defineProperty(window, "scrollY", { configurable: true, value: 1e6 });
    window.dispatchEvent(new Event(LAYOUT_EVENT));
    expect(train.style.transform).toBe("translateY(458.00px)");
    // A shorter window: 330px of track, 30px stops. END's centre at 315: the glyph's top at 300.
    sizes.rail = 330;
    sizes.phone = 800;
    for (const callback of sized) callback();
    expect(train.style.transform).toBe("translateY(300.00px)");
    // 20 / 800, and the phone's train at END.
    expect(phone.style.left).toBe("97.5%");
    stop();
    expect(observed.size).toBe(0);
  });

  it("leans into speed down the rail (skewY) while the phone's leans along its hairline (skewX), and stands upright on teardown", async () => {
    mount();
    const stop = startStrip(context(true));
    const [phoneGlyph, railGlyph] = [...document.querySelectorAll<HTMLElement>(".strip-glyph")];
    window.dispatchEvent(new Event("scroll"));
    Object.defineProperty(window, "scrollY", { configurable: true, value: 120 });
    await frame();
    await frame();
    expect(railGlyph!.style.transform).toMatch(/^skewY\(\d+(\.\d+)?deg\)$/);
    expect(phoneGlyph!.style.transform).toMatch(/^skewX\(-\d+(\.\d+)?deg\)$/);
    stop();
    expect(railGlyph!.style.transform).toBe("");
    expect(phoneGlyph!.style.transform).toBe("");
  });

  it("never leans with Motion off", async () => {
    mount();
    const stop = startStrip(context(false));
    window.dispatchEvent(new Event("scroll"));
    Object.defineProperty(window, "scrollY", { configurable: true, value: 120 });
    await frame();
    await frame();
    for (const glyph of document.querySelectorAll<HTMLElement>(".strip-glyph")) expect(glyph.style.transform).toBe("");
    stop();
  });
});
