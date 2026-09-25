// The roadmap's route line, from prototype v3's sections.js: stops alternate high and low across a 1200×150
// drawing, joined by S-curves, with a short lead-in and lead-out. Sleepers are laid by sampling the path, since a
// Server Component has no getPointAtLength.

import { round2 } from "./dial";

export interface RoutePoint {
  readonly x: number;
  readonly y: number;
}

export interface Sleeper {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export function routeStops(count: number): readonly RoutePoint[] {
  return Array.from({ length: count }, (_, i) => ({ x: 70 + (i * 1060) / (count - 1), y: i % 2 ? 104 : 46 }));
}

type Segment = { readonly kind: "line"; readonly a: RoutePoint; readonly b: RoutePoint } | { readonly kind: "cubic"; readonly p: readonly [RoutePoint, RoutePoint, RoutePoint, RoutePoint] };

function segments(stops: readonly RoutePoint[]): readonly Segment[] {
  const first = stops[0]!;
  const last = stops.at(-1)!;
  const curves = stops.slice(1).map((to, i): Segment => {
    const from = stops[i]!;
    const mx = (from.x + to.x) / 2;
    return { kind: "cubic", p: [from, { x: mx, y: from.y }, { x: mx, y: to.y }, to] };
  });
  return [{ kind: "line", a: { x: first.x - 50, y: first.y }, b: first }, ...curves, { kind: "line", a: last, b: { x: last.x + 50, y: last.y } }];
}

export function routePath(stops: readonly RoutePoint[]): string {
  return segments(stops)
    .map((s, i) => {
      if (s.kind === "line") return i === 0 ? `M${s.a.x} ${s.a.y} L${s.b.x} ${s.b.y}` : `L${s.b.x} ${s.b.y}`;
      const [, c1, c2, end] = s.p;
      return `C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${end.x} ${end.y}`;
    })
    .join(" ");
}

function pointAt(s: Segment, t: number): RoutePoint {
  if (s.kind === "line") return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
  const [p0, p1, p2, p3] = s.p;
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** Sleepers every `spacing` units of arc length, each `2 × half` across the path at that point. */
export function routeSleepers(stops: readonly RoutePoint[], spacing = 14, half = 6): readonly Sleeper[] {
  const samples = segments(stops).flatMap((s, index) => Array.from({ length: 64 + (index === 0 ? 1 : 0) }, (_, i) => pointAt(s, (index === 0 ? i : i + 1) / 64)));
  const lengths = samples.reduce<number[]>((acc, p, i) => [...acc, i === 0 ? 0 : acc[i - 1]! + Math.hypot(p.x - samples[i - 1]!.x, p.y - samples[i - 1]!.y)], []);
  const total = lengths.at(-1)!;
  return Array.from({ length: Math.floor(total / spacing) + 1 }, (_, k) => {
    const d = k * spacing;
    const j = Math.max(1, lengths.findIndex((l) => l >= d));
    const a = samples[j - 1]!;
    const b = samples[j]!;
    const span = lengths[j]! - lengths[j - 1]! || 1;
    const t = Math.min(1, Math.max(0, (d - lengths[j - 1]!) / span));
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    return { x1: round2(x - nx * half), y1: round2(y - ny * half), x2: round2(x + nx * half), y2: round2(y + ny * half) };
  });
}
