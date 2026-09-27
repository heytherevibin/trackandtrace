import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroDial } from "@/components/landing/journey/hero-dial";
import { startHero } from "@/components/landing/journey/hero";
import { PLATE_EVENT, RESULT_EVENT, type PlateDetail, type ResultDetail } from "@/components/landing/journey/journey-events";
import { keep } from "@/components/landing/journey/start-journey";

const mount = () =>
  render(
    <div className="dial-host">
      <HeroDial />
      <p className="dial-readout" />
    </div>,
  );

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const plate = (detail: PlateDetail) => window.dispatchEvent(new CustomEvent<PlateDetail>(PLATE_EVENT, { detail }));
const result = (detail: ResultDetail) => window.dispatchEvent(new CustomEvent<ResultDetail>(RESULT_EVENT, { detail }));
const chartAt = () => new Date(Date.now() + 3 * 3_600_000).toISOString();

describe("the hero dial's chart face", () => {
  it("survives a rebuild while the plate still shows its result, and goes with the plate's next entry", () => {
    const { container } = mount();
    const dial = container.querySelector(".hero-dial")!;
    const arc = container.querySelector(".dial-arc")!;
    const kept = keep<ResultDetail | null>(null);

    let stop = startHero({ motion: true, intro: false, result: kept, still: keep({ columns: false, height: null }) });
    result({ hero: true, kind: "ok", chartAt: chartAt() });
    expect(dial).toHaveClass("is-face");
    stop();
    expect(dial).not.toHaveClass("is-face");

    // The Motion switch rebuilds the journey still: the face is a true reading, so it is drawn again at once.
    stop = startHero({ motion: false, intro: false, result: kept, still: keep({ columns: false, height: null }) });
    expect(dial).toHaveClass("is-face");
    expect(arc.getAttribute("d")).toMatch(/^M/);
    expect(container.querySelector(".dial-readout")!.textContent).toMatch(/^Chart /);

    // Back at entry ("Check another PNR", a picked recent check): the face goes, and stays gone after a rebuild.
    plate({ hero: true, digits: 0, running: false, done: false });
    expect(dial).not.toHaveClass("is-face");
    stop();
    stop = startHero({ motion: true, intro: false, result: kept, still: keep({ columns: false, height: null }) });
    expect(dial).not.toHaveClass("is-face");
    expect(arc.getAttribute("d")).toBe("");
    stop();
  });
});

describe("the hero dial's teardown", () => {
  it("reverts its tweens newest first, so the dashed ring ends as the server drew it", async () => {
    const { container } = mount();
    const dashed = container.querySelector<SVGCircleElement>(".dial-ring.is-dashed")!;
    const stop = startHero({ motion: true, intro: false, result: keep<ResultDetail | null>(null), still: keep({ columns: false, height: null }) });
    await wait(60);
    // A digit nudges the dashed ring on top of its slow turn: this nudge's "original" is the turn's mid-value.
    plate({ hero: true, digits: 1, running: false, done: false });
    await wait(60);
    stop();
    expect(dashed.style.getPropertyValue("transform")).toBe("");
  });
});
