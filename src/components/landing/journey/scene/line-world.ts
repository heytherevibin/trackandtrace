import { BufferGeometry, Float32BufferAttribute, Group, LineSegments, type LineBasicMaterial } from "three";
import type { LineStyle } from "./lines";

// The line under the train, drawn (prototype v3's scene/line-world.js, verbatim numbers): rails and sleepers,
// the overhead contact wire on its masts, and a faint survey grid on the ground. Everything is LineSegments,
// so it costs almost nothing.

const RAIL_Z = 0.874;
const GROUND_Y = -0.9;

function segments(points: readonly number[], material: LineBasicMaterial): LineSegments {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(points, 3));
  const l = new LineSegments(geo, material);
  l.frustumCulled = false;
  return l;
}

export function buildLine(
  style: LineStyle,
  from: number,
  to: number,
  { masts = true, grid = true, sleepers = true }: { readonly masts?: boolean; readonly grid?: boolean; readonly sleepers?: boolean } = {},
): Group {
  const g = new Group();
  const rails: number[] = [];
  for (const z of [-RAIL_Z, RAIL_Z]) {
    for (const dz of [-0.036, 0.036]) rails.push(from, 0, z + dz, to, 0, z + dz);
    for (const dz of [-0.075, 0.075]) rails.push(from, -0.17, z + dz, to, -0.17, z + dz);
  }
  g.add(segments(rails, style.line));

  if (sleepers) {
    const s: number[] = [];
    for (let x = from; x <= to; x += 0.62) {
      const y = -0.17;
      const a = x - 0.13;
      const b = x + 0.13;
      s.push(a, y, -1.375, a, y, 1.375, b, y, -1.375, b, y, 1.375);
    }
    // Ballast shoulders
    for (const z of [-2.0, 2.0]) s.push(from, -0.3, z, to, -0.3, z);
    for (const z of [-3.4, 3.4]) s.push(from, GROUND_Y, z, to, GROUND_Y, z);
    g.add(segments(s, style.faint));
  }

  if (masts) {
    const w: number[] = [];
    const m: number[] = [];
    const xs: number[] = [];
    for (let x = Math.ceil(from / 54) * 54; x <= to; x += 54) xs.push(x);
    xs.forEach((x, i) => {
      const stagger = i % 2 ? -0.22 : 0.22;
      m.push(x, GROUND_Y, -3.4, x, 7.3, -3.4); // mast
      m.push(x + 0.16, GROUND_Y, -3.4, x + 0.16, 7.3, -3.4);
      m.push(x, 6.6, -3.4, x, 6.3, stagger); // cantilever
      m.push(x, 6.0, -3.4, x, 5.75, stagger); // stay
      m.push(x, 6.3, stagger, x, 5.6, stagger); // dropper to the registration arm
    });
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i];
      const b = xs[i + 1];
      const za = i % 2 ? -0.22 : 0.22;
      const zb = -za;
      const steps = 9;
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps;
        const t1 = (k + 1) / steps;
        const sag = (t: number): number => 6.8 - 0.5 * Math.sin(Math.PI * t);
        const z0 = za + (zb - za) * t0;
        const z1 = za + (zb - za) * t1;
        w.push(a + (b - a) * t0, sag(t0), z0, a + (b - a) * t1, sag(t1), z1); // messenger
        w.push(a + (b - a) * t0, 5.6, z0, a + (b - a) * t1, 5.6, z1); // contact wire
        if (k > 0) w.push(a + (b - a) * t0, sag(t0), z0, a + (b - a) * t0, 5.6, z0); // droppers
      }
    }
    const wires = new Group();
    wires.add(segments(m, style.line), segments(w, style.line));
    wires.name = "wires";
    g.add(wires);
  }

  if (grid) {
    const p: number[] = [];
    const step = 6;
    for (let x = Math.floor(from / step) * step; x <= to; x += step) p.push(x, GROUND_Y, -42, x, GROUND_Y, 30);
    for (let z = -42; z <= 30; z += step) p.push(from, GROUND_Y, z, to, GROUND_Y, z);
    g.add(segments(p, style.faint));
  }
  return g;
}
