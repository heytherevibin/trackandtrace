import { describe, expect, it } from "vitest";
import { columnsFit, columnsZone, distribute, leaderFrom, letterbox } from "@/components/landing/journey/labels-layout";

describe("the labels' columns (prototype v3's labels.js)", () => {
  it("spreads a column evenly between its top and bottom", () => {
    expect(distribute([20, 20, 20], 0, 100)).toEqual({ tops: [0, 40, 80], fits: true });
  });

  it("keeps labels at least 6px apart, and says when they do not fit", () => {
    expect(distribute([40, 40, 40], 0, 100)).toEqual({ tops: [0, 46, 92], fits: false });
    expect(distribute([], 0, 100)).toEqual({ tops: [], fits: true });
  });

  it("leaves the drawing the room between the columns, 24px clear of each", () => {
    expect(columnsZone({ leftEdges: [200, 256], rightEdges: [1100, 1060], top: 240, floor: 700 })).toEqual({ l: 280, t: 240, r: 1036, b: 700 });
  });

  it("gives way to the parts list when the columns crowd the drawing, or the title block is too wide", () => {
    const zone = { l: 280, t: 240, r: 1036, b: 700 };
    expect(columnsFit({ fits: true, zone, pinWidth: 1400, titleWidth: 352 })).toBe(true);
    expect(columnsFit({ fits: false, zone, pinWidth: 1400, titleWidth: 352 })).toBe(false);
    expect(columnsFit({ fits: true, zone: { ...zone, r: 700 }, pinWidth: 1400, titleWidth: 352 })).toBe(false); // 420 < 34% of 1400
    expect(columnsFit({ fits: true, zone, pinWidth: 1400, titleWidth: 600 })).toBe(false); // over 42%
    expect(columnsFit({ fits: true, zone: { ...zone, b: 380 }, pinWidth: 1400, titleWidth: 352 })).toBe(false); // under 150px tall
  });
});

describe("where the drawing lands, and its leaders", () => {
  it("fits a viewBox inside a box, centred (meet)", () => {
    expect(letterbox([0, 0, 800, 400], { x: 100, y: 50, width: 400, height: 400 })).toEqual({ scale: 0.5, x: 100, y: 150 });
  });

  it("draws a leader from a label's near edge to its part", () => {
    expect(leaderFrom({ left: 10, top: 300, width: 256 }, "left", { x: 500, y: 200 })).toEqual({ x1: 266, y1: 300, x2: 500, y2: 200 });
    expect(leaderFrom({ left: 1100, top: 120, width: 256 }, "right", { x: 900, y: 180 })).toEqual({ x1: 1100, y1: 120, x2: 900, y2: 180 });
  });
});
