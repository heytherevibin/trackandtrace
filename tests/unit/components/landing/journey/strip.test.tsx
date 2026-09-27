import { afterEach, describe, expect, it, vi } from "vitest";
import { LAYOUT_EVENT, type ResultDetail } from "@/components/landing/journey/journey-events";
import { keep } from "@/components/landing/journey/start-journey";
import { STATIONS } from "@/components/landing/journey/stations";
import { startStrip } from "@/components/landing/journey/strip";

// The strip's train is placed on every scroll frame, so that frame only writes: the widths it clamps by are
// read on layout (the build, tt:layout), never between one train's write and the next train's read.

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

function mount(trackWidth = { value: 1000 }) {
  const stops = STATIONS.map((s) => `<li><a href="#${s.id}">${s.code}</a></li>`).join("");
  const sections = STATIONS.map((s) => `<section id="${s.id}"></section>`).join("");
  document.body.innerHTML = `<nav id="route-strip"><span class="strip-odo"></span><div class="strip-track"><ol class="strip-stops">${stops}</ol><span class="strip-train"><span class="strip-glyph"></span></span></div><span class="strip-now"></span></nav><div class="phone-rail"><span class="strip-train"><span class="strip-glyph"></span></span></div>${sections}`;
  const reads = vi.fn();
  for (const train of document.querySelectorAll<HTMLElement>(".strip-train")) {
    const track = train.parentElement!;
    Object.defineProperty(train, "offsetParent", { get: () => (reads("offsetParent"), track) });
    Object.defineProperty(train, "offsetWidth", { get: () => (reads("offsetWidth"), 40) });
    Object.defineProperty(track, "clientWidth", { get: () => (reads("clientWidth"), trackWidth.value) });
  }
  return reads;
}

const stub = window.ResizeObserver;
afterEach(() => {
  window.ResizeObserver = stub;
  document.body.replaceChildren();
});

describe("the strip's train", () => {
  it("is placed on scroll from widths measured on layout, never read in the scroll frame", async () => {
    const reads = mount();
    const stop = startStrip({ motion: false, intro: false, result: keep<ResultDetail | null>(null) });
    expect(reads).toHaveBeenCalled();
    const trains = [...document.querySelectorAll<HTMLElement>(".strip-train")];
    // Clamped at DEP by half the measured glyph: 20 / 1000.
    for (const t of trains) expect(t.style.left).toBe("2%");

    reads.mockClear();
    window.dispatchEvent(new Event("scroll"));
    await frame();
    await frame();
    expect(reads).not.toHaveBeenCalled();
    for (const t of trains) expect(t.style.left).toBe("2%");

    window.dispatchEvent(new Event(LAYOUT_EVENT));
    expect(reads).toHaveBeenCalled();
    stop();
  });

  it("is placed again when its track changes width (the station's name, the fonts), from widths read after layout", () => {
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
    const width = { value: 1000 };
    mount(width);
    const stop = startStrip({ motion: false, intro: false, result: keep<ResultDetail | null>(null) });
    const train = document.querySelector<HTMLElement>(".strip-train")!;
    expect(observed.has(train.parentElement!)).toBe(true);
    expect(train.style.left).toBe("2%");

    width.value = 800;
    for (const callback of sized) callback();
    // 20 / 800.
    expect(train.style.left).toBe("2.5%");
    stop();
    expect(observed.size).toBe(0);
  });
});
