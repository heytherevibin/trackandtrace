import { BoxGeometry, CylinderGeometry, Mesh, type BufferGeometry, type Material, type Object3D } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Builders for the drawn train's primitives (prototype v3's scene/util.js), in metres. The maths the poses use
// lives in math.ts, so the poses need no three.js.

export type Axis = "x" | "y" | "z";

/** A box whose origin is its centre; rounded when r > 0. */
export function boxGeo(w: number, h: number, d: number, r = 0, seg = 2): BufferGeometry {
  if (r > 0) return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));
  return new BoxGeometry(w, h, d);
}

export function mesh(geo: BufferGeometry, mat: Material, x = 0, y = 0, z = 0): Mesh {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

export function box(parent: Object3D, mat: Material, w: number, h: number, d: number, x: number, y: number, z: number, r = 0): Mesh {
  const m = mesh(boxGeo(w, h, d, r), mat, x, y, z);
  parent.add(m);
  return m;
}

/** A cylinder lying along the given axis. */
export function cyl(parent: Object3D, mat: Material, radius: number, length: number, x: number, y: number, z: number, axis: Axis = "y", seg = 16, radiusTop = radius): Mesh {
  const g = new CylinderGeometry(radiusTop, radius, length, seg);
  if (axis === "x") g.rotateZ(Math.PI / 2);
  if (axis === "z") g.rotateX(Math.PI / 2);
  const m = mesh(g, mat, x, y, z);
  parent.add(m);
  return m;
}
