// The bake's pure core (prototype v3's bake-entry.js): the GPU has drawn every edge in its own colour, depth-tested
// against the fills. Walk each edge across that image and keep the stretches where its own colour survived, crop to
// the train, and chain the stretches into SVG path data. No three.js and no DOM, so it is unit-tested on synthetic
// images; scripts/bake/page.ts runs it in the browser.

export type IdAt = (x: number, y: number) => number;
export type Quad = readonly [number, number, number, number];

/** One edge on the image, in pixels (y down). */
export interface ScreenSeg {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** A visible stretch of edge `i`, [x0, y0, x1, y1]. */
export interface Run {
  readonly i: number;
  readonly xy: Quad;
}

export interface Box {
  readonly l: number;
  readonly t: number;
  readonly r: number;
  readonly b: number;
}

export type LineClass = "line" | "faint" | "near";

export interface EdgeMeta {
  readonly part: string;
  readonly cls: LineClass;
}

/** The id an RGBA readback holds at (x, y); render targets are bottom-up. */
export function idReader(px: Uint8Array, W: number, H: number): IdAt {
  return (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return 0;
    const k = ((H - 1 - y) * W + x) * 4;
    return px[k] | (px[k + 1] << 8) | (px[k + 2] << 16);
  };
}

/** Edge i's colour (id i + 1, 24 bits) as 0..1 channels. */
export function idColour(i: number): readonly [number, number, number] {
  const id = i + 1;
  return [(id & 255) / 255, ((id >> 8) & 255) / 255, ((id >> 16) & 255) / 255];
}

/**
 * The stretches of edge i whose own colour survived. It samples once per pixel along the edge's longer screen
 * axis, looks one pixel either side, bridges up to two missed samples, and drops stretches shorter than minRun.
 */
export function walkRuns(idAt: IdAt, seg: ScreenSeg, i: number, minRun = 1.5): Run[] {
  const { x0, y0, x1, y1 } = seg;
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
  if (n < 1) return [];
  const id = i + 1;
  const at = (k: number): readonly [number, number] => [x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n];
  const runs: Run[] = [];
  let start = -1;
  let last = -1;
  let gap = 0;
  const flush = () => {
    if (start >= 0 && last - start >= minRun) runs.push({ i, xy: [...at(start), ...at(last)] });
    start = -1;
  };
  for (let k = 0; k <= n; k++) {
    const [x, y] = at(k);
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    let hit = false;
    for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1 && !hit; dx++) hit = idAt(cx + dx, cy + dy) === id;
    if (hit) {
      if (start < 0) start = k;
      last = k;
      gap = 0;
    } else if (start >= 0 && ++gap > 2) flush();
  }
  flush();
  return runs;
}

/** The train's bounding box (runs whose part is not "world"), plus a margin, clamped inside the image. */
export function cropBox(runs: readonly Run[], isTrain: (i: number) => boolean, margin: number, W: number, H: number): Box | null {
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (const run of runs) {
    if (!isTrain(run.i)) continue;
    const [x0, y0, x1, y1] = run.xy;
    l = Math.min(l, x0, x1);
    r = Math.max(r, x0, x1);
    t = Math.min(t, y0, y1);
    b = Math.max(b, y0, y1);
  }
  if (!Number.isFinite(l)) return null;
  const mx = (r - l) * margin;
  const my = (b - t) * margin;
  return { l: Math.max(0, l - mx), t: Math.max(0, t - my), r: Math.min(W, r + mx), b: Math.min(H, b + my) };
}

/** Round to the nearest half pixel: finer than a hairline can show, and it keeps a page's stills within budget (§3.H). */
export const f1 = (v: number): number => Math.round(v * 2) / 2;

/** Chains stretches that meet end to start into one polyline (v3's greedy `byStart`/`used` chain). */
export function chainPath(list: readonly Quad[]): string {
  const byStart = new Map<string, number[]>();
  const k = (x: number, y: number) => `${Math.round(x * 2)},${Math.round(y * 2)}`;
  list.forEach((s, idx) => {
    const key = k(s[0], s[1]);
    if (!byStart.has(key)) byStart.set(key, []);
    byStart.get(key)!.push(idx);
  });
  const used = new Uint8Array(list.length);
  let d = "";
  list.forEach((s, idx) => {
    if (used[idx]) return;
    used[idx] = 1;
    let x = f1(s[0]);
    let y = f1(s[1]);
    d += `M${x} ${y}`;
    let cur = s;
    for (;;) {
      const nx = f1(cur[2]);
      const ny = f1(cur[3]);
      d += `l${f1(nx - x)} ${f1(ny - y)}`;
      x = nx;
      y = ny;
      const next = (byStart.get(k(cur[2], cur[3])) ?? []).find((j) => !used[j]);
      if (next === undefined) break;
      used[next] = 1;
      cur = list[next];
    }
  });
  return d.replace(/(\d)\.0(?=\D|$)/g, "$1").replace(/ -/g, "-");
}

/**
 * Groups each run's stretch by `${part}|${cls}`, keeping it when either end is inside `box`, translating to
 * box-relative coordinates, and chains each group's stretches into one path.
 */
export function pathsByPart(runs: readonly Run[], meta: readonly EdgeMeta[], box: Box): Record<string, string> {
  const inBox = (x: number, y: number) => x >= box.l && x <= box.r && y >= box.t && y <= box.b;
  const groups = new Map<string, Quad[]>();
  for (const run of runs) {
    const [x0, y0, x1, y1] = run.xy;
    if (!inBox(x0, y0) && !inBox(x1, y1)) continue;
    const { part, cls } = meta[run.i];
    const key = `${part}|${cls}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push([x0 - box.l, y0 - box.t, x1 - box.l, y1 - box.t]);
  }
  const out: Record<string, string> = {};
  for (const [key, list] of groups) out[key] = chainPath(list);
  return out;
}
