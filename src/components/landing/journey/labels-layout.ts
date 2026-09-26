import type { LabelSide } from "./train-parts";

// Where the drawn train's labels stand (prototype v3's labels.js), as pure maths: two columns beside the still
// drawing, each spread evenly and at least 6px apart; the free zone they leave the drawing; whether that zone is
// room enough, or the parts list should stand instead; where the drawing lands in it; and each label's leader.

export interface Box {
  readonly l: number;
  readonly t: number;
  readonly r: number;
  readonly b: number;
}

export function distribute(heights: readonly number[], top: number, bottom: number, minGap = 6): { readonly tops: readonly number[]; readonly fits: boolean } {
  if (heights.length === 0) return { tops: [], fits: true };
  const total = heights.reduce((a, b) => a + b, 0);
  const gap = (bottom - top - total) / Math.max(1, heights.length - 1);
  const step = Math.max(gap, minGap);
  const tops = heights.map((_, i) => Math.round(top + heights.slice(0, i).reduce((a, b) => a + b + step, 0)));
  return { tops, fits: gap >= minGap };
}

/** The room between the columns (pin-relative), 24px clear of each, under the words and above the title block. */
export function columnsZone({ leftEdges, rightEdges, top, floor }: { readonly leftEdges: readonly number[]; readonly rightEdges: readonly number[]; readonly top: number; readonly floor: number }): Box {
  return { l: Math.max(...leftEdges) + 24, r: Math.min(...rightEdges) - 24, t: top, b: floor };
}

/** Columns stand only when both fit and leave the drawing room: at least max(260px, 34% of the pin) wide and 150px tall, the title block within 42% of the pin. */
export function columnsFit({ fits, zone, pinWidth, titleWidth }: { readonly fits: boolean; readonly zone: Box; readonly pinWidth: number; readonly titleWidth: number }): boolean {
  return fits && zone.r - zone.l >= Math.max(260, pinWidth * 0.34) && zone.b - zone.t >= 150 && titleWidth <= pinWidth * 0.42;
}

/** Where a viewBox drawn "xMidYMid meet" inside a box lands: its scale and its top-left corner. */
export function letterbox(viewBox: readonly [number, number, number, number], box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): { readonly scale: number; readonly x: number; readonly y: number } {
  const scale = Math.min(box.width / viewBox[2], box.height / viewBox[3]);
  return { scale, x: box.x + (box.width - viewBox[2] * scale) / 2, y: box.y + (box.height - viewBox[3] * scale) / 2 };
}

/** A label's leader: from the label's edge nearest the drawing, level with its top rule, to its part. */
export function leaderFrom(label: { readonly left: number; readonly top: number; readonly width: number }, side: LabelSide, anchor: { readonly x: number; readonly y: number }): { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number } {
  return { x1: side === "left" ? label.left + label.width : label.left, y1: label.top, x2: anchor.x, y2: anchor.y };
}
