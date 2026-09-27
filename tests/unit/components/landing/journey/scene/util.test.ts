import { BoxGeometry, Group, MeshBasicMaterial } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { describe, expect, it } from "vitest";
import { box, boxGeo, cyl } from "@/components/landing/journey/scene/util";

const MAT = new MeshBasicMaterial();

describe("the drawing's primitives", () => {
  it("builds square boxes plain and rounded ones rounded", () => {
    expect(boxGeo(1, 2, 3)).toBeInstanceOf(BoxGeometry);
    expect(boxGeo(1, 2, 3, 0.1)).toBeInstanceOf(RoundedBoxGeometry);
  });

  it("adds a box to its parent, centred where asked", () => {
    const parent = new Group();
    const m = box(parent, MAT, 1, 1, 1, 2, 3, 4);
    expect(m.parent).toBe(parent);
    expect(m.position.toArray()).toEqual([2, 3, 4]);
  });

  it("lays a cylinder along x or z", () => {
    const parent = new Group();
    const along = (axis: "x" | "z") => {
      const c = cyl(parent, MAT, 0.5, 4, 0, 0, 0, axis);
      c.geometry.computeBoundingBox();
      const b = c.geometry.boundingBox;
      if (!b) throw new Error("no bounding box");
      return { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z };
    };
    expect(along("x").x).toBeCloseTo(4, 5);
    expect(along("x").y).toBeCloseTo(1, 5);
    expect(along("z").z).toBeCloseTo(4, 5);
  });
});
