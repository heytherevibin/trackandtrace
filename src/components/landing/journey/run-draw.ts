import { messages } from "@/messages";
import { layers, type RunLayout } from "./geometry/run";
import { STATIONS, kmFigure } from "./stations";

// The window-seat run's line diagram (spec §3.A; run.ts lays it out and moves it): the far masts, the line with its
// kilometre posts and a platform per station, and the near posts, drawn into the pin's three svgs.

const NS = "http://www.w3.org/2000/svg";
const kmOf = (id: string): number => STATIONS.find((s) => s.id === id)?.km ?? 0;
const KM = { from: kmOf("features"), to: kmOf("use") };

function stroke(cls: string, d: string): SVGPathElement {
  const path = document.createElementNS(NS, "path");
  path.setAttribute("class", cls);
  path.setAttribute("d", d);
  return path;
}

export interface RunSvgs {
  readonly far: SVGSVGElement;
  readonly line: SVGSVGElement;
  readonly near: SVGSVGElement;
}

/** Draws the run as `layout` lays it out: each layer's strokes, the line's kilometre posts and its stops. */
export function drawRun(layout: RunLayout, { far, line, near }: RunSvgs): void {
  const drawn = layers(layout, KM);
  const pairs = [
    [far, drawn.far],
    [line, drawn.line],
    [near, drawn.near],
  ] as const;
  for (const [svg, layer] of pairs) {
    svg.setAttribute("viewBox", `0 0 ${layer.span} ${layout.h}`);
    svg.style.width = `${layer.span}px`;
    svg.replaceChildren(...layer.strokes.map((s) => stroke(s.cls, s.d)));
  }
  for (const post of drawn.line.posts) {
    const label = document.createElementNS(NS, "text");
    label.setAttribute("class", "run-km");
    label.setAttribute("x", String(post.x));
    label.setAttribute("y", String(post.y));
    label.textContent = messages.journey.run.km(kmFigure(post.km));
    line.append(label);
  }
  drawn.line.stops.forEach((stop, i) => {
    const g = document.createElementNS(NS, "g");
    g.setAttribute("class", "run-stop");
    g.dataset.i = String(i);
    g.append(stroke("run-stroke is-platform", stop.platform), stroke("run-stroke is-tick", stop.tick));
    line.append(g);
  });
}
