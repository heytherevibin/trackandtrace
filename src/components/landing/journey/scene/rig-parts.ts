// Builders for the drawn train's parts: body sections, bogies, wheels, cab ends, the pantograph and the
// LHB coach. Geometry is built from primitives in metres (x along the track, the train facing +x, y up
// from the rail top, z toward the viewer) and drawn as hairline edges (see lines.ts).
// Ported from prototype v3's scene/rig-parts.js (361 lines).
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  EdgesGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Shape,
  Vector2,
  type LineBasicMaterial,
  type Object3D,
} from "three";
import { box, boxGeo, cyl, mesh } from "./util";
import { cloneShared, drawn, mergeAll, setBase, type LineStyle } from "./lines";
import { TAU, clamp } from "./math";

/** A named set of materials a builder paints with. Materials are irrelevant to a drawing (see `M` below). */
export type MaterialMap = Readonly<Record<string, MeshBasicMaterial>>;

// Materials are irrelevant to a drawing; every builder receives the same placeholder.
const PLACEHOLDER = new MeshBasicMaterial();
export const M: MaterialMap = new Proxy<MaterialMap>({}, { get: () => PLACEHOLDER });

export const GAUGE_Z = 0.865; // wheel centre, either side of the track axis

// ---------------------------------------------------------------------------------------------
// Body sections: vertical sides, a rounded eave and a shallow roof arch. Sampled as a polyline so
// the dark roof cap can follow exactly the same curve.

export interface BodyProfile {
  readonly pts: readonly (readonly [number, number])[];
  readonly roofAt: (z: number) => number;
  readonly flat: number;
}

export function bodyProfile({ hw, bottom, eave, crown, eaveW = 0.3 }: { readonly hw: number; readonly bottom: number; readonly eave: number; readonly crown: number; readonly eaveW?: number }): BodyProfile {
  const pts: Array<[number, number]> = [];
  const flat = hw - eaveW; // where the roof arch meets the eave curve
  const archDrop = 0.17;
  const roofAt = (z: number): number => crown - (archDrop * (z * z)) / (flat * flat);
  pts.push([-hw + 0.03, bottom]);
  pts.push([-hw, bottom + 0.2]);
  pts.push([-hw, eave]);
  const eaveTop = roofAt(flat);
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push([-flat - eaveW * Math.cos(a), eave + (eaveTop - eave) * Math.sin(a)]);
  }
  for (let i = 1; i < 12; i++) {
    const z = -flat + (2 * flat * i) / 12;
    pts.push([z, roofAt(z)]);
  }
  for (let i = 6; i >= 1; i--) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push([flat + eaveW * Math.cos(a), eave + (eaveTop - eave) * Math.sin(a)]);
  }
  pts.push([hw, eave]);
  pts.push([hw, bottom + 0.2]);
  pts.push([hw - 0.03, bottom]);
  return { pts, roofAt, flat };
}

/** Extrude a cross-section (z, y points) along x, centred on x = 0. */
export function extrudeSection(pts: readonly (readonly [number, number])[], length: number, bevel = 0.1): BufferGeometry {
  const shape = new Shape(pts.map(([z, y]) => new Vector2(z, y)));
  const g = new ExtrudeGeometry(shape, { depth: length, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.5, bevelSegments: 3, curveSegments: 8, steps: 1 });
  // Shape x is across (z); extrusion runs along +Z. Turn the extrusion onto +X.
  g.rotateY(Math.PI / 2);
  g.translate(-length / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

/** The dark roof: a thin shell over the arch between the eaves. */
export function roofCap(profile: BodyProfile, length: number, lift = 0.018, thickness = 0.03): BufferGeometry {
  const { roofAt, flat } = profile;
  const outer: Array<[number, number]> = [];
  const inner: Array<[number, number]> = [];
  const span = flat + 0.12;
  for (let i = 0; i <= 24; i++) {
    const z = -span + (2 * span * i) / 24;
    const y = roofAt(Math.max(-flat, Math.min(flat, z))) - (Math.abs(z) > flat ? (Math.abs(z) - flat) * 0.9 : 0);
    outer.push([z, y + lift + thickness]);
    inner.push([z, y + lift]);
  }
  return extrudeSection([...outer, ...inner.reverse()], length, 0);
}

// ---------------------------------------------------------------------------------------------
// Bogies and wheels

/** A wheel of radius 1 on the z axis, with bolts and a paint mark so its turning reads. */
export function wheelGeometry(): BufferGeometry {
  const R = 1;
  const profile = [
    [0.0, -0.11], [0.2, -0.11], [0.22, -0.035], [0.86, -0.035], [0.9, -0.07], [0.985, -0.07], [1.0, -0.05],
    [1.0, 0.06], [1.06, 0.07], [1.07, 0.1], [0.9, 0.1], [0.86, 0.035], [0.22, 0.035], [0.2, 0.11], [0.0, 0.11],
  ].map(([r, y]) => new Vector2(r * R, y));
  const lathe = new LatheGeometry(profile, 36);
  lathe.rotateX(Math.PI / 2); // lathe axis y -> z
  const parts: BufferGeometry[] = [lathe.toNonIndexed()];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const bolt = new CylinderGeometry(0.045, 0.045, 0.05, 8).rotateX(Math.PI / 2);
    bolt.translate(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.06); // on the web face
    parts.push(bolt.toNonIndexed());
  }
  const mark = new BoxGeometry(0.5, 0.05, 0.02).translate(0.6, 0, 0.045);
  parts.push(mark.toNonIndexed());
  for (const p of parts) {
    p.clearGroups();
    for (const k of Object.keys(p.attributes)) if (!["position", "normal", "uv"].includes(k)) p.deleteAttribute(k);
  }
  return mergeParts(parts);
}

function mergeParts(parts: readonly BufferGeometry[]): BufferGeometry {
  let count = 0;
  for (const p of parts) count += p.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    if (p.attributes.uv) uv.set(p.attributes.uv.array, o * 2);
    o += p.attributes.position.count;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setAttribute("normal", new BufferAttribute(nor, 3));
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  return g;
}

export interface BogieSpec {
  readonly axles: number;
  readonly pitch: number;
  readonly radius: number;
  readonly frameY: number;
  readonly frameLen: number;
  readonly heavy: boolean;
}

/** A wheel's track position and radius, registered by a bogie build so wheels can be drawn once, shared. */
export interface WheelReg {
  readonly x: number;
  readonly r: number;
}

/**
 * A bogie frame with springs, axle boxes and dampers. Wheels are registered, not built: the train
 * draws every wheel from one instanced mesh.
 */
export function bogie(parent: Object3D, m: MaterialMap, cx: number, { axles, pitch, radius, frameY, frameLen, heavy }: BogieSpec, wheels: WheelReg[]): Group {
  const g = new Group();
  g.position.x = cx;
  parent.add(g);
  const sideZ = GAUGE_Z + 0.27;
  for (const s of [-1, 1]) {
    box(g, m.bogie, frameLen, heavy ? 0.42 : 0.3, 0.16, 0, frameY, s * sideZ, 0.04);
    box(g, m.bogie, frameLen * 0.55, 0.12, 0.2, 0, frameY + (heavy ? 0.3 : 0.24), s * sideZ, 0.03);
  }
  box(g, m.bogie, heavy ? 0.5 : 0.36, 0.26, sideZ * 2, 0, frameY - 0.02, 0, 0.03);
  const first = -((axles - 1) * pitch) / 2;
  for (let i = 0; i < axles; i++) {
    const ax = first + i * pitch;
    wheels.push({ x: cx + ax, r: radius });
    cyl(g, m.under, 0.075, GAUGE_Z * 2 + 0.3, ax, radius, 0, "z", 12);
    for (const s of [-1, 1]) {
      box(g, m.bogie, 0.36, 0.34, 0.28, ax, radius, s * (GAUGE_Z + 0.24), 0.04);
      cyl(g, m.spring, 0.11, 0.3, ax, radius + 0.33, s * (GAUGE_Z + 0.24), "y", 10);
      if (!heavy) cyl(g, m.bright, 0.3, 0.05, ax, radius, s * 0.42, "z", 20); // brake discs, glinting between wheels
    }
  }
  // Secondary springs and a yaw damper on each side
  for (const s of [-1, 1]) {
    cyl(g, m.spring, heavy ? 0.14 : 0.17, 0.36, heavy ? 0.9 : 0, frameY + 0.4, s * (sideZ - 0.08), "y", 12);
    if (heavy) cyl(g, m.spring, 0.14, 0.36, -0.9, frameY + 0.4, s * (sideZ - 0.08), "y", 12);
    const damper = cyl(g, m.under, 0.045, 1.1, frameLen * 0.32, frameY + 0.12, s * (sideZ + 0.1), "x", 8);
    damper.rotation.z = 0.22 * s;
  }
  if (heavy) {
    for (const s of [-1, 1]) for (const e of [-1, 1]) box(g, m.bogie, 0.4, 0.34, 0.3, e * (frameLen / 2 - 0.2), frameY + 0.1, s * (sideZ + 0.02), 0.04); // sand boxes
  }
  return g;
}

export const LOCO = { hw: 1.575, bottom: 1.2, eave: 3.5, crown: 4.12, bodyHalf: 8.9, noseDepth: 0.85, bogieCentres: 5.9, roofTop: 4.1 } as const;
export const COACH = { length: 23.0, hw: 1.62, bottom: 1.04, eave: 3.4, crown: 4.03, bogieCentres: 7.45 } as const;

/** One cab end, built facing +x from the body end at x = 0. Mirrored for the rear cab. */
export function cabNose(m: MaterialMap): Group {
  const g = new Group();
  const { hw, bottom } = LOCO;
  const D = LOCO.noseDepth;
  const sill = 2.42;
  // Lower nose: a rounded block from the buffer beam to the windscreen sill.
  box(g, m.paint, D + 0.2, sill - bottom, hw * 2 - 0.02, D / 2 - 0.1, (sill + bottom) / 2, 0, 0.16);
  // Livery band wrapping the nose just under the windscreen.
  box(g, m.paintPale, D + 0.24, 0.24, hw * 2 + 0.01, D / 2 - 0.1, sill - 0.2, 0, 0.1);
  // Raked windscreen slab between the sill and the roof edge.
  const top = { x: 0.12, y: 3.72 };
  const low = { x: D - 0.06, y: sill };
  const len = Math.hypot(low.x - top.x, low.y - top.y);
  const ang = Math.atan2(low.y - top.y, low.x - top.x);
  const slab = mesh(boxGeo(len + 0.12, 0.12, hw * 2 - 0.08, 0.05), m.paint, (top.x + low.x) / 2, (top.y + low.y) / 2, 0);
  slab.rotation.z = ang;
  g.add(slab);
  // Windscreen panes and centre pillar, laid on the slab.
  for (const s of [-1, 1]) {
    const pane = mesh(boxGeo(len * 0.78, 0.03, hw - 0.32, 0.03), m.cabGlass, 0, 0, 0);
    pane.position.set((top.x + low.x) / 2 + Math.cos(ang + Math.PI / 2) * 0.07, (top.y + low.y) / 2 + Math.sin(ang + Math.PI / 2) * 0.07, s * (hw / 2 - 0.02));
    pane.rotation.z = ang;
    g.add(pane);
  }
  // Side fairings closing the triangle between the slab and the body sides, with a cab window.
  const tri = new Shape([new Vector2(0, sill - 0.02), new Vector2(low.x + 0.04, sill - 0.02), new Vector2(top.x, top.y + 0.02), new Vector2(0, top.y + 0.02)]);
  for (const s of [-1, 1]) {
    const f = new ExtrudeGeometry(tri, { depth: 0.06, bevelEnabled: false });
    const fm = mesh(f, m.paint, 0, 0, s > 0 ? hw - 0.07 : -hw + 0.01);
    g.add(fm);
  }
  // Headlight housing on the roof edge, with its lens facing forward.
  box(g, m.paint, 0.5, 0.3, 0.62, 0.05, 3.93, 0, 0.1);
  const lens = cyl(g, m.lens, 0.13, 0.06, 0.32, 3.93, 0, "x", 20);
  lens.userData.headlight = true;
  // Marker lamps low on the nose, buffers, coupler and cowcatcher.
  for (const s of [-1, 1]) {
    cyl(g, m.marker, 0.07, 0.05, D + 0.02, 1.78, s * 1.1, "x", 14);
    cyl(g, m.under, 0.09, 0.45, D + 0.12, 1.04, s * 0.95, "x", 12);
    cyl(g, m.bright, 0.19, 0.06, D + 0.36, 1.04, s * 0.95, "x", 20);
    box(g, m.rubber, 0.03, 0.9, 0.08, low.x - 0.25, 3.1, s * 0.55).rotation.z = ang + Math.PI / 2; // wipers
  }
  box(g, m.under, 0.5, 0.26, 0.4, D + 0.2, 0.98, 0); // centre coupler
  const pilot = new Shape([new Vector2(D - 0.05, 1.22), new Vector2(D + 0.2, 1.22), new Vector2(D + 0.62, 0.22), new Vector2(D - 0.05, 0.22)]);
  const pg = new ExtrudeGeometry(pilot, { depth: hw * 1.7, bevelEnabled: false });
  pg.translate(0, 0, -hw * 0.85);
  g.add(mesh(pg, m.under));
  // Cab door and handrail on each side, just behind the nose.
  for (const s of [-1, 1]) {
    const dz = s * (hw + 0.012);
    box(g, m.rubber, 0.03, 1.9, 0.02, -0.25, 2.15, dz);
    box(g, m.rubber, 0.03, 1.9, 0.02, -1.0, 2.15, dz);
    box(g, m.rubber, 0.78, 0.03, 0.02, -0.62, 3.1, dz);
    box(g, m.cabGlass, 0.5, 0.5, 0.03, -0.62, 2.72, s * (hw + 0.02), 0.02);
    cyl(g, m.bright, 0.017, 1.2, -1.15, 1.95, s * (hw + 0.07), "y", 6);
    for (let k = 0; k < 3; k++) box(g, m.under, 0.5, 0.05, 0.2, -0.62, 0.45 + k * 0.3, s * (hw - 0.06)); // steps
  }
  return g;
}

/** A single-arm pantograph. Returns its group and a setter for how far it is raised (0..1). */
export interface Pantograph {
  readonly group: Group;
  /** The collector head, where the Night glow hangs (J5). */
  readonly head: Group;
  readonly set: (t: number) => void;
}

export function pantograph(m: MaterialMap): Pantograph {
  const g = new Group();
  g.userData.keep = true;
  const insulatorPosts: ReadonlyArray<readonly [number, number]> = [[-0.45, -0.42], [-0.45, 0.42], [0.45, -0.42], [0.45, 0.42]];
  for (const [x, z] of insulatorPosts) {
    for (let k = 0; k < 3; k++) cyl(g, m.insulator, 0.07 - k * 0.006, 0.08, x, 0.05 + k * 0.09, z, "y", 10);
  }
  box(g, m.bogie, 1.2, 0.06, 1.0, 0, 0.3, 0);
  const L1 = 1.45;
  const L2 = 1.5;
  const pivot = new Group();
  pivot.position.set(-0.1, 0.36, 0);
  g.add(pivot);
  box(pivot, m.bright, L1, 0.07, 0.07, L1 / 2, 0, 0);
  box(pivot, m.bright, L1 * 0.9, 0.04, 0.5, L1 * 0.45, 0, 0); // lower arm's cross frame
  const knee = new Group();
  knee.position.set(L1, 0, 0);
  pivot.add(knee);
  for (const s of [-1, 1]) {
    const arm = cyl(knee, m.bright, 0.022, L2, L2 / 2, 0, s * 0.18, "x", 8);
    arm.rotation.y = -s * 0.1;
  }
  const head = new Group();
  head.position.set(L2, 0, 0);
  knee.add(head);
  box(head, m.bright, 0.1, 0.05, 1.7, 0, 0.06, 0);
  box(head, m.rubber, 0.08, 0.03, 1.5, 0, 0.1, 0);
  for (const s of [-1, 1]) {
    const horn = box(head, m.bright, 0.06, 0.04, 0.34, 0, 0.0, s * 0.98);
    horn.rotation.x = s * 0.5;
  }
  const HEAD_X = -0.05; // folded flat, the head sits over the pivot; raised, it climbs almost straight up
  const set = (t: number): void => {
    const H = 0.12 + clamp(t) * 0.94;
    const tx = HEAD_X;
    const d = Math.hypot(tx, H);
    const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const a1 = Math.atan2(H, tx) - Math.acos(cosA); // the knee folds forward
    const kx = L1 * Math.cos(a1);
    const ky = L1 * Math.sin(a1);
    const a2 = Math.atan2(H - ky, tx - kx);
    pivot.rotation.z = a1;
    knee.rotation.z = a2 - a1;
    head.rotation.z = -a2;
  };
  set(0);
  return { group: g, head, set };
}

// ---------------------------------------------------------------------------------------------
// Drawn parts

type DrawnOptions = { readonly threshold?: number; readonly lineMat?: LineBasicMaterial };

/** A part drawn a step at a time (spec §3.H: ≤ 61 ms a step at 4× CPU): its pieces built and merged into one fill,
 * then, after a yield, its edges found. The same drawing as drawnPart; the part lands in `out.part`. */
export function* drawnPartSteps(build: (g: Group) => void, style: LineStyle, out: { part?: Group }, opts?: DrawnOptions): Generator<void, void, void> {
  const g = new Group();
  build(g);
  const merged = mergeAll(g);
  yield;
  out.part = drawn(merged, style, opts);
}

export function drawnPart(build: (g: Group) => void, style: LineStyle, opts?: DrawnOptions): Group {
  const out: { part?: Group } = {};
  const steps = drawnPartSteps(build, style, out, opts);
  while (!steps.next().done);
  if (!out.part) throw new Error("drawnPart: its steps finished without a part");
  return out.part;
}

/** Long lines along a body where a smooth roof arch would otherwise draw no edge at all. */
export function featureLines(prof: BodyProfile, length: number, style: LineStyle, lift = 0.05): LineSegments {
  const half = length / 2;
  const pts: number[] = [];
  const add = (z: number, y: number): void => {
    pts.push(-half, y, z, half, y, z);
  };
  add(0, prof.roofAt(0) + lift);
  for (const s of [-1, 1]) add(s * (prof.flat + 0.02), prof.roofAt(prof.flat) + lift * 0.6);
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pts, 3));
  return new LineSegments(geo, style.line);
}

// One wheel geometry and its edges, built the first time a wheel is drawn and shared by every wheel.
let wheelGeo: BufferGeometry | null = null;
let wheelEdges: EdgesGeometry | null = null;
function drawnWheel(style: LineStyle): Group {
  wheelGeo ??= wheelGeometry();
  wheelEdges ??= new EdgesGeometry(wheelGeo, 20);
  const g = new Group();
  g.add(new Mesh(wheelGeo, style.fill));
  const e = new LineSegments(wheelEdges, style.line);
  setBase(e, style.line);
  g.add(e);
  return g;
}

/** A drawn wheel, once instantiated and placed: what a rig's turnWheels() needs to spin it. */
export interface WheelInstance {
  readonly obj: Group;
  readonly r: number;
  readonly side: number;
}

export function addWheels(parent: Object3D, list: readonly WheelReg[], style: LineStyle, registry: WheelInstance[]): void {
  for (const w of list) {
    for (const s of [-1, 1]) {
      const o = drawnWheel(style);
      o.position.set(w.x, w.r, s * GAUGE_Z);
      o.scale.set(w.r, w.r, 1);
      if (s < 0) o.rotation.y = Math.PI;
      o.userData.wheel = { r: w.r, side: s };
      parent.add(o);
      registry.push({ obj: o, r: w.r, side: s });
    }
  }
}

/**
 * An LHB coach, in two steps (its body, then its bogies) so neither holds the page for long. The two bogie
 * frames are one frame, shared. `out.coach` receives { obj, length }.
 */
export function* coachSteps(style: LineStyle, wheels: WheelInstance[], out: { coach?: { readonly obj: Group; readonly length: number } }): Generator<void, void, void> {
  const { length: L, hw } = COACH;
  const prof = bodyProfile({ hw: hw - 0.05, bottom: COACH.bottom + 0.05, eave: COACH.eave, crown: COACH.crown - 0.05 });
  const coach = new Group();
  const windows: ReadonlyArray<readonly [number, number, number, number]> = [[-4.2, 1.8, 0.5, 0.65], [-1.1, 2.4, 0.42, -0.6], [1.9, 1.4, 0.55, 0.7], [4.4, 1.6, 0.38, -0.5]];
  const body: { part?: Group } = {};
  yield* drawnPartSteps((g) => {
    g.add(mesh(extrudeSection(prof.pts, L, 0.1), M.x));
    g.add(mesh(roofCap(prof, L - 0.3), M.x));
    for (const s of [-1, 1]) {
      box(g, M.x, L - 4.2, 1.02, 0.03, 0, 2.54, s * (hw + 0.004));
      for (let i = 0; i < 11; i++) box(g, M.x, 1.12, 0.7, 0.03, (i - 5) * 1.66, 2.55, s * (hw + 0.03), 0.02);
      for (const e of [-1, 1]) {
        const dx = e * (L / 2 - 1.1);
        box(g, M.x, 0.84, 1.96, 0.02, dx, 2.14, s * (hw + 0.02));
        box(g, M.x, 0.36, 0.55, 0.03, dx, 2.62, s * (hw + 0.035), 0.02);
      }
    }
    for (const e of [-1, 1]) {
      box(g, M.x, 2.4, 0.26, 2.0, e * (L / 2 - 3.5), COACH.crown + 0.02, 0, 0.08);
      box(g, M.x, 0.34, 2.36, 1.12, e * (L / 2 + 0.26), 2.28, 0);
      for (let r = 0; r < 4; r++) box(g, M.x, 0.025, 2.42, 1.2, e * (L / 2 + 0.14 + r * 0.07), 2.28, 0);
    }
    box(g, M.x, L - 1.2, 0.3, 2.6, 0, 0.93, 0);
    for (const [x, w, h, z] of windows) box(g, M.x, w, h, 0.9, x, 0.93 - h / 2 - 0.1, z, 0.03);
  }, style, body);
  const shell = body.part;
  if (!shell) throw new Error("rig: the coach's body finished without a part");
  shell.add(featureLines(prof, L, style));
  coach.add(shell);
  yield;
  const axles: WheelReg[] = [];
  const frame = drawnPart((g) => bogie(g, M, 0, { axles: 2, pitch: 2.56, radius: 0.4575, frameY: 0.62, frameLen: 3.3, heavy: false }, axles), style);
  const local: WheelReg[] = [];
  for (const e of [-1, 1]) {
    const f = e < 0 ? frame : cloneShared(frame);
    f.position.x = e * COACH.bogieCentres;
    coach.add(f);
    for (const a of axles) local.push({ x: e * COACH.bogieCentres + a.x, r: a.r });
  }
  addWheels(coach, local, style, wheels);
  out.coach = { obj: coach, length: L + 0.6 };
}
