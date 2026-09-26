import { BufferGeometry, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Matrix4, Mesh, MeshBasicMaterial, type Color, type Object3D } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Technical-drawing rendering (prototype v3's scene/lines.js): every solid is drawn as its hairline edges over a
// fill in the sheet's own ground colour, pushed back in depth so edges behind a surface are hidden (hidden-line
// removal). The bake reproduces the same push (FILL_OFFSET) when it decides which stretches of edge are visible.
// Colours arrive as a palette, never as hex: the live drawing reads the theme's tokens (J5); the bake needs none.

export interface Palette {
  readonly ground: Color;
  readonly ink: Color;
  readonly steel: Color;
  readonly steelText: Color;
}

export interface LineOpacity {
  readonly line: number;
  readonly faint: number;
  readonly near: number;
}

/** Day's ink weights. Night's arrive with the live drawing (J5); the still takes its weights from CSS. */
export const DAY_OPACITY: LineOpacity = { line: 0.8, faint: 0.1, near: 0.42 };

/** How far a fill is pushed back in depth: the live drawing and the bake must agree. */
export const FILL_OFFSET = { factor: 1.5, units: 2 } as const;

export interface LineStyle {
  readonly fill: MeshBasicMaterial;
  readonly line: LineBasicMaterial;
  readonly faint: LineBasicMaterial;
  /** The nearest things the departing train passes: lighter, so they read as foreground. */
  readonly near: LineBasicMaterial;
  readonly accent: LineBasicMaterial;
  /** The general-arrangement dimension lines. */
  readonly dim: LineBasicMaterial;
}

export function createStyle(palette: Palette, opacity: LineOpacity = DAY_OPACITY): LineStyle {
  const ink = (o: number) => new LineBasicMaterial({ color: palette.ink, transparent: true, opacity: o, fog: true });
  return {
    fill: new MeshBasicMaterial({ color: palette.ground, polygonOffset: true, polygonOffsetFactor: FILL_OFFSET.factor, polygonOffsetUnits: FILL_OFFSET.units }),
    line: ink(opacity.line),
    faint: ink(opacity.faint),
    near: ink(opacity.near),
    accent: new LineBasicMaterial({ color: palette.steel, transparent: true, opacity: 1, fog: true }),
    dim: new LineBasicMaterial({ color: palette.steelText, transparent: true, opacity: 0, fog: false, depthTest: false }),
  };
}

const BASE = "baseMat";

/**
 * The material an edge set returns to after a highlight. Kept off userData's enumerable keys: three.js copies
 * userData through JSON when it clones, and a material does not survive that (shared coaches clone).
 */
export function setBase(edges: Object3D, material: LineBasicMaterial): void {
  Object.defineProperty(edges.userData, BASE, { value: material, enumerable: false, configurable: true, writable: true });
}

export function baseOf(edges: Object3D): LineBasicMaterial | undefined {
  const value: unknown = edges.userData[BASE];
  return value instanceof LineBasicMaterial ? value : undefined;
}

/** One solid as a drawing: its fill and its edges (creases sharper than `threshold` degrees). */
export function drawn(geometry: BufferGeometry, style: LineStyle, { threshold = 16, lineMat }: { readonly threshold?: number; readonly lineMat?: LineBasicMaterial } = {}): Group {
  const g = new Group();
  const fill = new Mesh(geometry, style.fill);
  const edges = new LineSegments(new EdgesGeometry(geometry, threshold), lineMat ?? style.line);
  setBase(edges, lineMat ?? style.line);
  g.add(fill, edges);
  return g;
}

/** A copy that shares every geometry and material (a second coach, the rear bogie), with its edges' base kept. */
export function cloneShared<T extends Object3D>(src: T): T {
  const dst = src.clone(true) as T;
  const a: Object3D[] = [];
  const b: Object3D[] = [];
  src.traverse((o) => a.push(o));
  dst.traverse((o) => b.push(o));
  a.forEach((o, i) => {
    const base = baseOf(o);
    if (base) setBase(b[i], base);
  });
  return dst;
}

/** Merge every mesh under `group` into one geometry (positions and normals only). */
export function mergeAll(group: Object3D): BufferGeometry {
  group.updateMatrixWorld(true);
  const inverse = new Matrix4().copy(group.matrixWorld).invert();
  const parts: BufferGeometry[] = [];
  group.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(geo.attributes)) if (k !== "position" && k !== "normal") geo.deleteAttribute(k);
    geo.clearGroups();
    const m = new Matrix4().multiplyMatrices(inverse, o.matrixWorld);
    geo.applyMatrix4(m);
    if (m.determinant() < 0) {
      const a = geo.attributes.position;
      for (let t = 0; t < a.count; t += 3) {
        for (let k = 0; k < 3; k++) {
          const i1 = (t + 1) * 3 + k;
          const i2 = (t + 2) * 3 + k;
          const tmp = a.array[i1];
          a.array[i1] = a.array[i2];
          a.array[i2] = tmp;
        }
      }
    }
    parts.push(geo);
  });
  return parts.length ? mergeGeometries(parts, false) : new BufferGeometry();
}

/** Replace each mesh in a live hierarchy (an animated part) with its drawing, keeping transforms. */
export function drawHierarchy<T extends Object3D>(root: T, style: LineStyle, opts?: { readonly threshold?: number; readonly lineMat?: LineBasicMaterial }): T {
  const meshes: Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof Mesh) meshes.push(o);
  });
  for (const m of meshes) {
    const d = drawn(m.geometry, style, opts);
    d.position.copy(m.position);
    d.quaternion.copy(m.quaternion);
    d.scale.copy(m.scale);
    const parent = m.parent;
    if (!parent) throw new Error("drawHierarchy: a mesh has no parent to receive its drawing — the rig built a detached mesh");
    parent.add(d);
    parent.remove(m);
  }
  return root;
}

/** Collect every edge line under an object, to switch it between ink and steel. */
export function edgesOf(obj: Object3D): LineSegments[] {
  const out: LineSegments[] = [];
  obj.traverse((o) => {
    if (o instanceof LineSegments && baseOf(o)) out.push(o);
  });
  return out;
}
