// The window-seat run's geometry (spec §3.A; prototype v3's run.js), pure so it is unit-tested: run.ts measures the
// page and writes what these return. Units are the pin's px, x to the right, y down. The track's own left edge is x 0,
// so the line layer, which rides with the track, shares its x.

export interface StationBox {
  readonly x0: number;
  readonly x1: number;
}
export interface RunLayout {
  /** The pin's width and height. */
  readonly w: number;
  readonly h: number;
  /** Where the train holds, from the pin's left edge. */
  readonly trainX: number;
  readonly boxes: readonly StationBox[];
  readonly centers: readonly number[];
  readonly halves: readonly number[];
  /** The first station's centre, and how far the track travels to bring the last one to the window. */
  readonly first: number;
  readonly travel: number;
}
export interface KmRange {
  readonly from: number;
  readonly to: number;
}
export interface Stroke {
  readonly cls: string;
  readonly d: string;
}
export interface Layer {
  readonly span: number;
  readonly strokes: readonly Stroke[];
}
export interface Post {
  readonly x: number;
  readonly y: number;
  readonly km: number;
}
export interface Stop {
  readonly platform: string;
  readonly tick: string;
}
export interface Layers {
  readonly far: Layer;
  readonly line: Layer & { readonly posts: readonly Post[]; readonly stops: readonly Stop[] };
  readonly near: Layer;
}

/** How much slower the far masts pass, and how much faster the near posts, than the line. */
export const PARALLAX = { far: 0.35, near: 1.8 } as const;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const f = (n: number): string => n.toFixed(1);

/** The line diagram's height along the window's foot. */
export function band(h: number): number {
  return h < 640 ? 96 : 124;
}

/** The window holds the tallest station above the line diagram, and is wide enough to read. */
export function fitsRun(heights: readonly number[], h: number, w: number): boolean {
  const room = h - band(h) - 20;
  return w >= 300 && heights.length > 0 && heights.every((height) => height <= room);
}

/** Where the train holds: a third in on a wide window, the middle on a phone. */
export function trainAt(w: number, phone: boolean): number {
  return Math.round(w * (phone ? 0.5 : 0.3));
}

/** Where the train holds so that every station, centred on it at its resting point, stands wholly inside the pin
 * (`halves`: each station's half-width): a third in on a wide window, the middle on a phone (trainAt), moved in only as
 * far as the widest station needs. Null when no place holds it: a station wider than the window, so the run does not pin
 * (its fit rule, as every pinned piece's: the words are read whole, or the sections read as ever). */
export function trainFor(w: number, phone: boolean, halves: readonly number[]): number | null {
  const half = Math.max(0, ...halves);
  const lo = Math.ceil(half);
  const hi = Math.floor(w - half);
  return lo > hi ? null : clamp(trainAt(w, phone), lo, hi);
}

export function runLayout(boxes: readonly StationBox[], pin: { readonly w: number; readonly h: number; readonly trainX: number }): RunLayout {
  const centers = boxes.map((b) => (b.x0 + b.x1) / 2);
  const halves = boxes.map((b) => (b.x1 - b.x0) / 2);
  const first = centers[0] ?? 0;
  return { ...pin, boxes, centers, halves, first, travel: Math.max(0, (centers.at(-1) ?? first) - first) };
}

/** How far into the run a station stands at the window: its centre's distance from the first's, within the travel. */
export function anchorOf(center: number, first: number, travel: number): number {
  return Math.round(clamp(center - first, 0, travel));
}

/** The station at the window at track position `pos`: the last whose near edge, less 24px, has reached it. */
export function hereAt(pos: number, centers: readonly number[], halves: readonly number[]): number {
  return centers.reduce((here, c, i) => (c - (halves[i] ?? 0) - 24 <= pos ? i : here), 0);
}

/** Each layer's sideways offset at progress p: the track and the line at the train's pace, the far masts slower, the
 * near posts faster, each lined up on the first station at p = 0. */
export function offsets(p: number, at: Pick<RunLayout, "trainX" | "first" | "travel">): { readonly track: number; readonly far: number; readonly near: number } {
  const base = at.trainX - at.first;
  const gone = p * at.travel;
  return { track: base - gone, far: (base - gone) * PARALLAX.far, near: (base - gone) * PARALLAX.near };
}

/** The train's lean after one frame that moved progress by dp: into its pace, a quarter of the way, never past 9°. */
export function leanStep(lean: number, dp: number, travel: number): number {
  return lean + (clamp(-dp * travel * 0.3, -9, 9) - lean) * 0.25;
}

/** The kilometre post at track x: the run counts on from 06's km to 07's. */
export function kmAt(x: number, first: number, travel: number, km: KmRange): number {
  return Math.round(km.from + ((x - first) / Math.max(1, travel)) * (km.to - km.from));
}

/** A lattice mast from y0 up to y1 (y grows down), w wide: its two legs, then braces zig-zagging up. */
export function mast(x: number, y0: number, y1: number, w: number): string {
  const parts = [`M${x} ${y0}V${y1}M${x + w} ${y0}V${y1}`];
  for (let y = y0, up = true; y > y1 + 8; y -= 12, up = !up) parts.push(`M${up ? x : x + w} ${y}L${up ? x + w : x} ${y - 12}`);
  return parts.join("");
}

/**
 * The window's three layers (v3's drawLayers):
 * - far: slim masts over the whole window carrying the overhead line (a sagging messenger, the contact wire and its
 *   droppers), and the horizon;
 * - the line: rails and sleepers, a kilometre post every 160px (every other one labelled, below the rails, where the
 *   train never passes over them), a platform and a tick under every station, and lattice masts;
 * - near: heavy posts close by, in the foreground.
 */
export function layers(at: RunLayout, km: KmRange): Layers {
  const { w, h, travel, first } = at;
  const foot = h - band(h);
  const rail = h - 46;
  const spans = { far: Math.ceil(w + travel * PARALLAX.far + 40), line: Math.ceil(w + travel + 40), near: Math.ceil(w + travel * PARALLAX.near + 40) };

  const top = Math.round(h * 0.1);
  const wire = top + 34;
  const sag = (t: number): number => top + 10 + 16 * Math.sin(Math.PI * t);
  const masts: number[] = [];
  for (let x = 90; x < spans.far; x += 210) masts.push(x);
  const far = [`M0 ${foot + 18}H${spans.far}`, ...masts.map((x) => `M${x} ${foot + 18}V${top}M${x - 14} ${top + 10}H${x + 14}`)];
  masts.slice(0, -1).forEach((a, i) => {
    const b = masts[i + 1] ?? a;
    const along = (k: number): number => a + ((b - a) * k) / 12;
    far.push(`M${a} ${top + 10}${Array.from({ length: 12 }, (_, j) => `L${f(along(j + 1))} ${f(sag((j + 1) / 12))}`).join("")}`);
    far.push(`M${a} ${wire}H${b}`);
    for (let k = 2; k < 12; k += 2) far.push(`M${f(along(k))} ${f(sag(k / 12))}V${wire}`);
  });

  const sleepers: string[] = [];
  for (let x = 0; x < spans.line; x += 12) sleepers.push(`M${x} ${rail - 3}V${rail + 9}`);
  const lineMasts: string[] = [];
  for (let x = 150; x < spans.line; x += 300) lineMasts.push(mast(x, rail - 2, foot - 44, 7));
  const ticks: string[] = [];
  const posts: Post[] = [];
  for (let x = 60, k = 0; x < spans.line; x += 160, k += 1) {
    const value = kmAt(x, first, travel, km);
    if (value < 0) continue;
    ticks.push(`M${x} ${rail + 10}V${rail + 17}`);
    if (k % 2 === 0) posts.push({ x: x + 4, y: rail + 24, km: value });
  }
  const stops = at.boxes.map((b, i) => ({
    platform: `M${f(b.x0)} ${rail - 30}H${f(b.x1)}M${f(b.x0)} ${rail - 30}V${rail - 24}M${f(b.x1)} ${rail - 30}V${rail - 24}`,
    tick: `M${f(at.centers[i] ?? 0)} ${rail - 40}V${rail + 12}`,
  }));

  const near: string[] = [];
  for (let x = 40; x < spans.near; x += 260) near.push(mast(x, h, rail + 30, 12));

  return {
    far: { span: spans.far, strokes: [{ cls: "run-stroke is-far", d: far.join("") }] },
    line: {
      span: spans.line,
      strokes: [
        { cls: "run-stroke is-faint", d: sleepers.join("") },
        { cls: "run-stroke", d: `M0 ${rail}H${spans.line}M0 ${rail + 6}H${spans.line}${ticks.join("")}` },
        { cls: "run-stroke is-mast", d: lineMasts.join("") },
      ],
      posts,
      stops,
    },
    near: { span: spans.near, strokes: [{ cls: "run-stroke is-near", d: near.join("") }] },
  };
}
