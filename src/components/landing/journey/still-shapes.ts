import type { PartId } from "./train-parts";

// The baked still drawings' shape (spec §3.D; J4-2): four shapes, each one SVG file of <g id> per part, named by its
// content hash. still-manifest.ts, which the bake writes, fills these types in.

export type StillKind = "anatomy" | "terminus";
export type StillShapeName = "anatomyWide" | "anatomyTall" | "terminusWide" | "terminusTall";

export interface StillShape {
  readonly href: string;
  readonly viewBox: readonly [number, number, number, number];
  /** The groups this shape's file holds, one per part visible in it (labelled parts, tanks, coach, world). */
  readonly parts: readonly string[];
  /** Where each labelled part's leader ends, in the shape's viewBox units (the anatomy shapes only). */
  readonly anchors: Readonly<Partial<Record<PartId, readonly [number, number]>>>;
}

export interface StillManifest {
  readonly sourceHash: string;
  readonly shapes: Readonly<Record<StillShapeName, StillShape>>;
}

/** The wide drawing from 48rem up; the tall one on narrower screens. */
export const WIDE_QUERY = "(min-width: 48rem)";

export function shapeFor(kind: StillKind, wide: boolean): StillShapeName {
  if (kind === "anatomy") return wide ? "anatomyWide" : "anatomyTall";
  return wide ? "terminusWide" : "terminusTall";
}
