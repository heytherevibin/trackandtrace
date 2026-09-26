import { describe, expect, it } from "vitest";
import { chainPath, cropBox, f1, idColour, idReader, pathsByPart, walkRuns, type IdAt, type Run } from "../../../scripts/bake/trace";

/** A synthetic ID image: `paint(x, y)` says which edge id (0 = none) each pixel holds. */
function image(W: number, H: number, paint: (x: number, y: number) => number): IdAt {
  return (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : paint(x, y));
}

describe("reading the ID image", () => {
  it("decodes a 24-bit id from RGBA, reading render targets bottom-up", () => {
    const W = 2;
    const H = 2;
    const px = new Uint8Array(W * H * 4);
    // id 70000 = 0x011170 at image (1, 0), which a render target keeps in its last row
    px.set([0x70, 0x11, 0x01, 255], ((H - 1) * W + 1) * 4);
    expect(idReader(px, W, H)(1, 0)).toBe(70000);
    expect(idReader(px, W, H)(1, 1)).toBe(0);
    expect(idReader(px, W, H)(5, 0)).toBe(0);
  });

  it("colours edge i with id i + 1", () => {
    expect(idColour(0)).toEqual([1 / 255, 0, 0]);
    expect(idColour(256)).toEqual([1 / 255, 1 / 255, 0]);
  });
});

describe("walking an edge across the image", () => {
  const seg = { x0: 0, y0: 2, x1: 19, y1: 2 };

  it("keeps the stretches where the edge's own colour survived, split where another surface hides it", () => {
    // edge 0 (id 1) drawn at x 2..14 on row 2; a nearer surface's edge (id 2) covers x 7..11
    const idAt = image(20, 5, (x, y) => (y === 2 && x >= 2 && x <= 14 ? (x >= 7 && x <= 11 ? 2 : 1) : 0));
    expect(walkRuns(idAt, seg, 0).map((r) => r.xy)).toEqual([
      [1, 2, 7, 2],
      [11, 2, 15, 2],
    ]);
  });

  it("bridges a gap of two samples", () => {
    const idAt = image(20, 5, (x, y) => (y === 2 && x >= 2 && x <= 14 && x !== 8 && x !== 9 ? 1 : 0));
    expect(walkRuns(idAt, seg, 0)).toHaveLength(1);
  });

  it("drops stretches shorter than the least run", () => {
    const idAt = image(20, 5, (x, y) => (y === 2 && x === 5 ? 1 : 0));
    expect(walkRuns(idAt, seg, 0, 1.5)).toHaveLength(1);
    expect(walkRuns(idAt, seg, 0, 3)).toHaveLength(0);
  });

  it("ignores an edge that is a point on screen", () => {
    expect(walkRuns(image(4, 4, () => 1), { x0: 1, y0: 1, x1: 1, y1: 1 }, 0)).toEqual([]);
  });
});

describe("cropping and writing paths", () => {
  const runs: Run[] = [
    { i: 0, xy: [100, 50, 200, 50] },
    { i: 1, xy: [150, 150, 150, 250] },
    { i: 2, xy: [0, 400, 1000, 400] },
  ];
  const meta = [
    { part: "shell", cls: "line" },
    { part: "roof", cls: "faint" },
    { part: "world", cls: "line" },
  ] as const;

  it("crops to the train, not the line side, with a margin, inside the image", () => {
    const box = cropBox(runs, (i) => meta[i].part !== "world", 0.1, 1800, 900);
    expect(box).toEqual({ l: 90, t: 30, r: 210, b: 270 });
    expect(cropBox([], () => true, 0.1, 10, 10)).toBeNull();
  });

  it("chains stretches that meet end to start into one polyline", () => {
    expect(chainPath([[0, 0, 10, 0], [10, 0, 10, 5]])).toBe("M0 0l10 0l0 5");
    expect(chainPath([[0, 0, 3, -2]])).toBe("M0 0l3-2");
    expect(chainPath([[0.04, 0, 1.26, 0], [9, 9, 9, 10]])).toBe("M0 0l1.5 0M9 9l0 1");
  });

  it("rounds to the nearest half pixel, which the eye cannot tell from a tenth at a hairline (§3.H budget)", () => {
    expect([f1(1.24), f1(1.26), f1(-0.3), f1(7.75)]).toEqual([1, 1.5, -0.5, 8]);
    expect(chainPath([[0.2, 0.3, 2.3, 4.8]])).toBe("M0 0.5l2.5 4.5");
  });

  it("groups each part's stretches inside the crop, crop-relative", () => {
    const box = { l: 90, t: 30, r: 210, b: 270 };
    expect(pathsByPart(runs, meta, box)).toEqual({ "shell|line": "M10 20l100 0", "roof|faint": "M60 120l0 100" });
  });

  // world's rails, sleepers and overhead wire run from -420 m to 520 m (line-world.ts): a stretch that dips into
  // the crop at one end can run far past it at the other. The crop clips the render (CSS overflow on the still's
  // <svg>), but getBBox() reads path data, not paint — so an uncropped coordinate silently reopens the very
  // hairline-vs-label collision the crop exists to prevent (drawing-checks.ts, spec §5). Every written stretch
  // must stay inside the box, never just have an end inside it.
  it("clips a stretch that only dips into the crop to the box's edge, never past it", () => {
    const box = { l: 90, t: 30, r: 210, b: 270 };
    const dips: Run[] = [{ i: 0, xy: [100, 150, 1000, 150] }]; // one end inside, running far right, level with the crop
    const dipsMeta = [{ part: "world", cls: "line" }] as const;
    expect(pathsByPart(dips, dipsMeta, box)).toEqual({ "world|line": "M10 120l110 0" }); // stops dead at r=210 (box-relative 120)
  });
});
