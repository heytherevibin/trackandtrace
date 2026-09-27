import { Box3, Line, Matrix4, Mesh, Vector3, type Camera, type Group, type Object3D, type PerspectiveCamera } from "three";
import type { Box } from "../labels-layout";
import { lerp } from "./math";
import type { Rig, RigPartId } from "./rig";

// Keeping the drawing clear of the words around it (prototype v3's scene/fit.js): each part's box is measured once in
// its own frame; each frame its corners are projected and, when the drawing reaches past the zone the page leaves it,
// the camera dollies back along its line of sight and slides only as far as it must. The result depends only on the
// pose, so scrolling back and forth lands on the same frame. Anything under a part flagged userData.noFit (the Night
// beam) is light, not the drawing, and never counts.

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}
export interface FitOptions {
  /** 0..1: how much the side limits hold (only while labels stand beside the drawing). */
  readonly across: number;
  readonly panto: number;
  /** The point the camera looks at; it moves with any slide. */
  readonly target: Vector3;
  /** 0..1: also slide the drawing to the zone's middle (narrow screens). */
  readonly center?: number;
}
export interface Fit {
  screenBox(camera: PerspectiveCamera, rect: Rect, panto: number): Box;
  apply(camera: PerspectiveCamera, rect: Rect, zone: Box | null, options: FitOptions): void;
}

/** Where a world point lands in a view's rectangle, in viewport CSS px. */
export function projectTo(point: Vector3, camera: Camera, rect: Rect, out = new Vector3()): ScreenPoint {
  out.copy(point).project(camera);
  return { x: rect.x + ((out.x + 1) / 2) * rect.w, y: rect.y + ((1 - out.y) / 2) * rect.h };
}

function lightOnly(o: Object3D, root: Object3D): boolean {
  for (let a: Object3D | null = o; a && a !== root; a = a.parent) if (a.userData.noFit === true) return true;
  return false;
}

function localBox(obj: Object3D): Box3 {
  obj.updateWorldMatrix(true, true);
  const inverse = obj.matrixWorld.clone().invert();
  const box = new Box3();
  const one = new Box3();
  const m = new Matrix4();
  obj.traverse((o) => {
    if (!(o instanceof Mesh || o instanceof Line) || lightOnly(o, obj)) return;
    const geometry = o.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) return;
    m.multiplyMatrices(inverse, o.matrixWorld);
    box.union(one.copy(geometry.boundingBox).applyMatrix4(m));
  });
  return box;
}

interface Measured {
  readonly id: RigPartId;
  readonly obj: Group;
  readonly low: Box3;
  readonly high: Box3 | null;
}

export function createFit(rig: Rig): Fit {
  rig.setPantograph(0);
  const lows = Object.values(rig.parts).map(({ id, obj }) => ({ id, obj, low: localBox(obj) }));
  // The trailing pantograph changes shape as it rises to the wire: measure it raised too, and blend.
  rig.setPantograph(1);
  const raised = localBox(rig.parts.pantoRear.obj);
  rig.setPantograph(0);
  const parts: readonly Measured[] = lows.map((p) => ({ ...p, high: p.id === "pantoRear" ? raised : null }));

  const box = new Box3();
  const corner = new Vector3();
  const projected = new Vector3();
  const right = new Vector3();
  const up = new Vector3();
  const offset = new Vector3();

  function screenBox(camera: PerspectiveCamera, rect: Rect, panto: number): Box {
    rig.group.updateMatrixWorld(true);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    let l = Infinity;
    let t = Infinity;
    let r = -Infinity;
    let b = -Infinity;
    for (const p of parts) {
      if (p.high) {
        box.min.lerpVectors(p.low.min, p.high.min, panto);
        box.max.lerpVectors(p.low.max, p.high.max, panto);
      } else box.copy(p.low);
      for (let i = 0; i < 8; i += 1) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(p.obj.matrixWorld);
        const s = projectTo(corner, camera, rect, projected);
        l = Math.min(l, s.x);
        r = Math.max(r, s.x);
        t = Math.min(t, s.y);
        b = Math.max(b, s.y);
      }
    }
    return { l, t, r, b };
  }

  function apply(camera: PerspectiveCamera, rect: Rect, zone: Box | null, { across, panto, target, center = 0 }: FitOptions): void {
    if (!zone) return;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const zw = zone.r - zone.l;
    const zh = zone.b - zone.t;
    const useX = across > 0 && zw > 120;
    if (zh < 80) return;
    for (let pass = 0; pass < 3; pass += 1) {
      const s = screenBox(camera, rect, panto);
      let k = 1;
      if (useX) k = Math.max(k, lerp(1, (s.r - s.l) / zw, across));
      k = Math.max(k, (s.b - s.t) / zh);
      // where the box lands once the camera has pulled back by k, then the least slide that brings it in
      const l = cx + (s.l - cx) / k;
      const r = cx + (s.r - cx) / k;
      const t = cy + (s.t - cy) / k;
      const b = cy + (s.b - cy) / k;
      let dx = useX ? (Math.max(0, zone.l - l) - Math.max(0, r - zone.r)) * across : 0;
      let dy = Math.max(0, zone.t - t) - Math.max(0, b - zone.b);
      if (center > 0) {
        dy = lerp(dy, (zone.t + zone.b) / 2 - (t + b) / 2, center);
        if (useX) dx = lerp(dx, ((zone.l + zone.r) / 2 - (l + r) / 2) * across, center);
      }
      if (k < 1.0005 && Math.abs(dx) < 0.25 && Math.abs(dy) < 0.25) return;
      if (k > 1) camera.position.sub(target).multiplyScalar(k).add(target);
      if (dx || dy) {
        const dist = camera.position.distanceTo(target);
        const pxPerUnit = rect.h / (2 * dist * Math.tan((camera.fov * Math.PI) / 360));
        right.setFromMatrixColumn(camera.matrixWorld, 0);
        up.setFromMatrixColumn(camera.matrixWorld, 1);
        offset.copy(right).multiplyScalar(-dx / pxPerUnit).addScaledVector(up, dy / pxPerUnit);
        camera.position.add(offset);
        target.add(offset);
      }
    }
    camera.updateMatrixWorld();
  }

  return { screenBox, apply };
}
