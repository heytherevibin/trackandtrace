import { describe, expect, it } from "vitest";
import { CALLOUT_PARTS, isPartId, partSide } from "@/components/landing/journey/train-parts";

describe("the drawn train's labelled parts", () => {
  it("are ten, leading end first", () => {
    expect(CALLOUT_PARTS).toEqual(["pantoFront", "shell", "cabFront", "bogieFront", "wheelsFront", "pantoRear", "roof", "cabRear", "bogieRear", "wheelsRear"]);
  });

  it("stand right of the drawing for the leading five and left for the trailing five", () => {
    expect(CALLOUT_PARTS.map(partSide)).toEqual(["right", "right", "right", "right", "right", "left", "left", "left", "left", "left"]);
  });

  it("knows its own ids", () => {
    expect(isPartId("roof")).toBe(true);
    expect(isPartId("coach")).toBe(false);
  });
});
