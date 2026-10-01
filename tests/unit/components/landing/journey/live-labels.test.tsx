import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveLabels, pinTop, revealOf, wipe } from "@/components/landing/journey/live-labels";

describe("the labels while the drawing is live (J5-5)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("reveal down each column, a fifth of the way apart (v3's labels)", () => {
    expect(revealOf(0, 0.5)).toBeCloseTo(0.9, 9);
    expect(revealOf(4, 0.5)).toBeCloseTo(0.42, 9);
    expect(revealOf(5, 0.5)).toBeCloseTo(0.9, 9);
    expect(revealOf(0, 0)).toBe(0);
    expect(revealOf(9, 1)).toBe(1);
  });

  it("wipe in from the left, never fading: fully clipped at 0, nothing clipped at 1", () => {
    expect(wipe(0)).toBe("inset(0 100.0% 0 0)");
    expect(wipe(0.25)).toBe("inset(0 75.0% 0 0)");
    expect(wipe(1)).toBe("");
    expect(wipe(2)).toBe("");
  });

  it("add their own leader drawing, and take it and every mark of theirs away again", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    document.body.innerHTML = `<section id="anatomy"><div class="anatomy-pin"><div class="anatomy-copy"></div><ol class="callouts"><li class="callout" data-part="shell" data-side="right"></li></ol><ol class="anatomy-legend"></ol><div class="title-block"></div><p class="anatomy-caption"></p></div></section>`;
    const section = document.getElementById("anatomy")!;
    const labels = createLiveLabels(section);
    expect(labels).not.toBeNull();
    expect(section.querySelector("svg.live-lines")).not.toBeNull();
    labels?.layout(); // jsdom measures nothing, so neither columns nor the list leave the drawing room
    expect(labels?.pin.dataset.live).toBe("list");
    labels?.clear();
    expect(section.querySelector("svg.live-lines")).toBeNull();
    expect(labels?.pin.dataset.live).toBeUndefined();
    expect(labels?.pin.getAttribute("style") ?? "").not.toContain("--anatomy-copy-h");
  });

  it("leave the drawing a zone while the list leaves it room, and none once the words take the window (spec §3.C's fit)", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true })); // narrow: the list, never columns
    document.body.innerHTML = `<section id="anatomy"><div class="anatomy-pin"><div class="anatomy-copy"></div><ol class="callouts"></ol><ol class="anatomy-legend"></ol><div class="title-block"></div><p class="anatomy-caption"></p></div></section>`;
    const section = document.getElementById("anatomy")!;
    const box = (el: Element, top: number, bottom: number, width = 390) => {
      el.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: top, width, height: bottom - top });
    };
    const labels = createLiveLabels(section)!;
    box(labels.pin, 0, 844);
    box(section.querySelector(".anatomy-copy")!, 0, 200);
    const legend = section.querySelector(".anatomy-legend")!;
    box(legend, 700, 840); // the list under the drawing leaves it 700 - 12 - (200 + 16) = 472px
    expect(labels.layout()).toEqual({ l: 8, r: window.innerWidth - 8, t: 216, b: 688 });
    box(legend, 370, 840); // 370 - 12 - 216 = 142px: less than the drawing's 150
    expect(labels.layout()).toBeNull();
  });

  it("leave the drawing no zone when the list itself runs past its own box (a phone on its side, its text at 200%)", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true })); // narrow: the list, never columns
    document.body.innerHTML = `<section id="anatomy"><div class="anatomy-pin"><div class="anatomy-copy"></div><ol class="callouts"></ol><ol class="anatomy-legend"></ol><div class="title-block"></div><p class="anatomy-caption"></p></div></section>`;
    const section = document.getElementById("anatomy")!;
    const box = (el: Element, left: number, top: number, width: number, height: number) => {
      el.getBoundingClientRect = () => DOMRect.fromRect({ x: left, y: top, width, height });
    };
    const labels = createLiveLabels(section)!;
    box(labels.pin, 0, 0, 844, 390);
    box(section.querySelector(".anatomy-copy")!, 0, 0, 844, 40);
    const legend = section.querySelector<HTMLElement>(".anatomy-legend")!;
    box(legend, 540, 50, 304, 330); // beside the drawing (a phone on its side)
    const sized = (scroll: number, client: number) => {
      Object.defineProperty(legend, "scrollHeight", { configurable: true, value: scroll });
      Object.defineProperty(legend, "clientHeight", { configurable: true, value: client });
    };
    sized(306, 306); // every part in its box
    expect(labels.layout()).toEqual({ l: 8, r: 528, t: 56, b: 378 });
    sized(434, 242); // the parts run past their box, over the chapter's words and the section below
    expect(labels.layout()).toBeNull();
  });

  it("say where the pin takes hold for the page as laid out now: its sticky top, the list's words measured afresh", () => {
    document.body.innerHTML = `<div class="anatomy-pin"><div class="anatomy-copy"></div></div>`;
    const pin = document.querySelector<HTMLElement>(".anatomy-pin")!;
    const copy = document.querySelector<HTMLElement>(".anatomy-copy")!;
    const measured = (top: number, height: number) => {
      Object.defineProperty(copy, "offsetTop", { configurable: true, get: () => top });
      Object.defineProperty(copy, "offsetHeight", { configurable: true, get: () => height });
    };
    // in columns, or before the labels are laid out: its sticky top as it stands
    pin.style.top = "64px";
    expect(pinTop(pin)).toBe(64);
    // the list in a window 844 tall: its words 232 tall, the pin 168 above the window's top
    pin.dataset.live = "list";
    pin.style.setProperty("--anatomy-copy-h", "232px");
    pin.style.top = "-168px";
    measured(0, 232);
    expect(pinTop(pin)).toBe(-168);
    // a resize to 660 laid the words out 6 shorter (their top padding is in vh) before the labels wrote it: -162
    measured(0, 226);
    expect(pinTop(pin)).toBe(-162);
  });

  it("are drawn only once a frame has placed them: each layout takes that back, until the next draw (the upkeep's 1b)", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    document.body.innerHTML = `<section id="anatomy"><div class="anatomy-pin"><div class="anatomy-copy"></div><ol class="callouts"><li class="callout" data-part="shell" data-side="right"></li></ol><ol class="anatomy-legend"></ol><div class="title-block"></div><p class="anatomy-caption"></p></div></section>`;
    const labels = createLiveLabels(document.getElementById("anatomy")!);
    const pin = labels!.pin;
    labels?.layout();
    expect(pin.hasAttribute("data-drawn")).toBe(false);
    labels?.draw(() => null, () => 0);
    expect(pin.hasAttribute("data-drawn")).toBe(true);
    labels?.layout(); // unplaced again (the labels' boxes reset), so not drawn until the next frame
    expect(pin.hasAttribute("data-drawn")).toBe(false);
    labels?.draw(() => null, () => 0);
    labels?.clear();
    expect(pin.hasAttribute("data-drawn")).toBe(false);
  });

  it("are nothing without the chapter's markup", () => {
    document.body.innerHTML = `<section id="anatomy"></section>`;
    expect(createLiveLabels(document.getElementById("anatomy")!)).toBeNull();
  });
});
