import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { startBerths } from "@/components/landing/journey/berths";
import { drawStrokes } from "@/components/landing/journey/drawing";
import { HeroDial } from "@/components/landing/journey/hero-dial";
import { startHero } from "@/components/landing/journey/hero";
import { RESULT_EVENT, type ResultDetail } from "@/components/landing/journey/journey-events";
import { keep } from "@/components/landing/journey/start-journey";

// A drawn stroke's teardown (svg.createDrawable): the handle is cancelled, never reverted, and everything
// drawable.js wrote is removed, so a rebuild finds the server's stroke and not a hidden "0 0" one.

const NS = "http://www.w3.org/2000/svg";
const WRITTEN = ["pathLength", "draw", "stroke-dasharray", "stroke-dashoffset"] as const;

/** Every trace drawable.js leaves on a stroke: its attributes and the inline linecap. */
function traces(el: Element): string[] {
  const left: string[] = WRITTEN.filter((name) => el.hasAttribute(name));
  if ((el as SVGElement).style.getPropertyValue("stroke-linecap")) left.push("style:stroke-linecap");
  return left;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(() => {
  document.body.replaceChildren();
});

describe("drawStrokes", () => {
  it("clears a draw cancelled midway, and it never writes again", async () => {
    const svg = document.createElementNS(NS, "svg");
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", "M0 0 L100 0");
    svg.append(path);
    document.body.append(svg);
    const drawing = drawStrokes([path]);
    drawing.play({ draw: ["0 0", "0 1"], duration: 200 });
    expect(traces(path)).not.toEqual([]);
    drawing.clear();
    expect(traces(path)).toEqual([]);
    await wait(320);
    expect(traces(path)).toEqual([]);
  });

  it("holds strokes at a drawn state, and clears that too", () => {
    const svg = document.createElementNS(NS, "svg");
    const line = document.createElementNS(NS, "line");
    svg.append(line);
    document.body.append(svg);
    const drawing = drawStrokes([line]);
    drawing.hold("0 0");
    expect(line.getAttribute("draw")).toBe("0 0");
    drawing.clear();
    expect(traces(line)).toEqual([]);
  });
});

describe("the hero dial's strokes", () => {
  const mount = () =>
    render(
      <div className="dial-host">
        <HeroDial />
        <p className="dial-readout" />
      </div>,
    );

  it("are the server's again after the intro's rings are torn down", () => {
    const { container } = mount();
    const stop = startHero({ motion: true, intro: true, result: keep<ResultDetail | null>(null) });
    const rings = [...container.querySelectorAll(".hero-dial svg > .dial-ring")];
    expect(rings).toHaveLength(3);
    stop();
    for (const ring of rings) expect(traces(ring)).toEqual([]);
  });

  it("are the server's again after the chart face's arc is torn down", () => {
    const { container } = mount();
    const stop = startHero({ motion: true, intro: false, result: keep<ResultDetail | null>(null) });
    window.dispatchEvent(new CustomEvent<ResultDetail>(RESULT_EVENT, { detail: { hero: true, kind: "ok", chartAt: new Date(Date.now() + 3 * 3_600_000).toISOString() } }));
    const arc = container.querySelector(".dial-arc")!;
    expect(arc.getAttribute("d")).toMatch(/^M/);
    stop();
    expect(traces(arc)).toEqual([]);
  });
});

describe("the berth plan's strokes", () => {
  it("carry no drawn state once torn down", () => {
    document.body.innerHTML = `<figure class="berth-plan"><svg><rect class="plan-line"/><line class="plan-line is-faint"/><rect class="plan-line plan-berth is-lit"/></svg></figure>`;
    // Off screen in jsdom (an empty box), so the entrance arms: every stroke is held hidden, at "0 0".
    const stop = startBerths({ motion: true, intro: false, result: keep<ResultDetail | null>(null) });
    const strokes = [...document.querySelectorAll(".plan-line")];
    expect(strokes.every((s) => s.getAttribute("draw") === "0 0")).toBe(true);
    stop();
    for (const stroke of strokes) expect(traces(stroke)).toEqual([]);
  });
});
