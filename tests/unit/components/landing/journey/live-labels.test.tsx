import { afterEach, describe, expect, it, vi } from "vitest";
import { createLiveLabels, revealOf, wipe } from "@/components/landing/journey/live-labels";

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

  it("are nothing without the chapter's markup", () => {
    document.body.innerHTML = `<section id="anatomy"></section>`;
    expect(createLiveLabels(document.getElementById("anatomy")!)).toBeNull();
  });
});
