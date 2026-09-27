// The drawn train's ten labelled parts (spec §3.A), in the labels' order: the leading end (right of the drawing)
// first, then the trailing end (left). The rig, the bake's anchors, the copy and the labels all key on these ids.
// No three.js here: the page imports this.

export const CALLOUT_PARTS = ["pantoFront", "shell", "cabFront", "bogieFront", "wheelsFront", "pantoRear", "roof", "cabRear", "bogieRear", "wheelsRear"] as const;

export type PartId = (typeof CALLOUT_PARTS)[number];
export type LabelSide = "left" | "right";

export function isPartId(v: string): v is PartId {
  return CALLOUT_PARTS.some((id) => id === v);
}

export function partSide(id: string): LabelSide {
  return CALLOUT_PARTS.findIndex((p) => p === id) < 5 ? "right" : "left";
}
