import { BufferGeometry, Float32BufferAttribute, Group, LineSegments, Mesh, Vector3, type Object3D } from "three";
import { box, cyl, mesh } from "./util";
import { baseOf, cloneShared, drawHierarchy, type LineStyle } from "./lines";
import { clamp } from "./math";
import {
  GAUGE_Z,
  LOCO,
  M,
  addWheels,
  bodyProfile,
  bogie,
  cabNose,
  coachSteps,
  drawnPart,
  extrudeSection,
  featureLines,
  pantograph,
  roofCap,
  type Pantograph,
  type WheelInstance,
  type WheelReg,
} from "./rig-parts";
import type { PartId } from "../train-parts";

// The drawn train: a WAP-7-style locomotive split into parts that can separate (an exploded view), and
// LHB coaches that couple up behind it. Built as a sequence of steps, one part each, so the page can build
// it a slice at a time between frames (J5's buildRigAsync) and never hold the main thread for long. Identical
// pieces — the coaches, the two bogie frames, every wheel — are built once and share their geometry.
// Ported from prototype v3's scene/rig.js (263 lines).

export type RigPartId = PartId | "tanks";

export interface RigPart {
  readonly id: RigPartId;
  readonly obj: Group;
  readonly base: Vector3;
  readonly explode: Vector3;
  readonly anchor: Vector3;
  readonly delay: number;
}

/** The v3 general-arrangement dimension anchors: overall length (below the rails), height (ahead of the nose). */
export type DimAnchorId = "length" | "height";

export interface Rig {
  readonly group: Group;
  readonly parts: Readonly<Record<RigPartId, RigPart>>;
  readonly coaches: readonly { readonly obj: Object3D; readonly baseX: number }[];
  /** 0 = assembled, 1 = fully apart; each part leaves a little after the one before. */
  setExplode(t: number): void;
  /** 0 = folded, 1 = the trailing pantograph at the wire (the leading one stays folded). */
  setPantograph(t: number): void;
  /** 0 = coaches waiting off to the left, 1 = coupled; `shown` caps how many draw. */
  setCoupling(t: number, shown?: number): void;
  turnWheels(): void;
  /** The world position of a labelled part's leader anchor. */
  anchor(id: PartId, v?: Vector3): Vector3;
  dimAnchor(which: DimAnchorId, v?: Vector3): Vector3;
  setDims(t: number): void;
  /** Light one part's edges in steel; null clears. */
  setHighlight(id: RigPartId | null): void;
  /** The headlight lens's centre in the front cab's frame (the Night beam, J5). */
  readonly headlight: Vector3;
  readonly cabFront: Group;
}

/** Narrows `o.userData.wheel`, set by `addWheels` (rig-parts.ts), back to its shape. */
function wheelOf(o: Object3D): { readonly r: number; readonly side: number } | undefined {
  const w: unknown = o.userData.wheel;
  if (typeof w !== "object" || w === null) return undefined;
  const r = (w as { r?: unknown }).r;
  const side = (w as { side?: unknown }).side;
  return typeof r === "number" && typeof side === "number" ? { r, side } : undefined;
}

/** Every wheel under a (cloned) object, registered so it turns with the track. */
function registerWheels(obj: Object3D, wheels: WheelInstance[]): void {
  obj.traverse((o) => {
    if (!(o instanceof Group)) return;
    const w = wheelOf(o);
    if (w) wheels.push({ obj: o, r: w.r, side: w.side });
  });
}

export function* rigSteps(style: LineStyle, opts: { readonly coaches?: number }, out: { rig?: Rig }): Generator<void, void, void> {
  const { coaches = 3 } = opts;
  const group = new Group();
  const loco = new Group();
  group.add(loco);
  const wheels: WheelInstance[] = [];
  const parts: Partial<Record<RigPartId, RigPart>> = {};
  const { hw, bodyHalf } = LOCO;
  const locoLength = bodyHalf * 2 + LOCO.noseDepth * 2 + 0.8;
  loco.position.x = -locoLength / 2;

  const part = (id: RigPartId, obj: Group, explode: readonly [number, number, number], anchor: readonly [number, number, number], delay = 0): void => {
    parts[id] = { id, obj, base: obj.position.clone(), explode: new Vector3(...explode), anchor: new Vector3(...anchor), delay };
    obj.traverse((o) => {
      if (o instanceof Mesh) o.userData.part = id;
    });
    loco.add(obj);
  };

  const prof = bodyProfile({ hw: hw - 0.05, bottom: LOCO.bottom + 0.05, eave: LOCO.eave, crown: LOCO.crown - 0.05, eaveW: 0.26 });
  const shell = drawnPart((g) => {
    g.add(mesh(extrudeSection(prof.pts, bodyHalf * 2, 0.1), M.x));
    for (const s of [-1, 1]) {
      const z = s * (hw + 0.004);
      box(g, M.x, bodyHalf * 2 - 0.3, 0.24, 0.03, 0, 2.22, z);
      const bands: ReadonlyArray<readonly [number, number]> = [[-4.6, 3.2], [-0.9, 3.4], [2.9, 3.0]];
      for (const [x, w] of bands) {
        box(g, M.x, w, 0.8, 0.03, x, 2.95, s * (hw + 0.012));
        for (let k = 0; k < Math.floor(w / 0.25); k++) box(g, M.x, 0.02, 0.72, 0.02, x - w / 2 + 0.12 + k * 0.25, 2.95, s * (hw + 0.03));
      }
      box(g, M.x, 0.6, 0.42, 0.03, 6.9, 2.95, s * (hw + 0.02), 0.02);
      box(g, M.x, 0.6, 0.42, 0.03, -6.9, 2.95, s * (hw + 0.02), 0.02);
      box(g, M.x, bodyHalf * 2 + 1.2, 0.26, 0.08, 0, 1.12, s * (hw - 0.02));
    }
  }, style);
  shell.add(featureLines(prof, bodyHalf * 2, style));
  part("shell", shell, [0, 0.9, 0], [2.9, 2.95, hw + 0.03]);
  yield;

  const roof = drawnPart((g) => {
    g.add(mesh(roofCap(prof, bodyHalf * 2 - 0.2), M.x));
    for (let x = -5.2; x <= 5.2; x += 2.6) cyl(g, M.x, 0.06, 0.26, x, LOCO.roofTop + 0.13, 0.25, "y", 10);
    cyl(g, M.x, 0.03, 10.6, 0, LOCO.roofTop + 0.28, 0.25, "x", 8);
    box(g, M.x, 0.9, 0.42, 0.7, 0.4, LOCO.roofTop + 0.2, -0.3, 0.06);
    for (const x of [-3.2, 3.2]) box(g, M.x, 2.6, 0.08, 1.9, x, LOCO.roofTop + 0.02, 0, 0.03);
  }, style);
  part("roof", roof, [0, 2.8, 0], [-3.2, LOCO.roofTop + 0.06, 0], 0.05);
  yield;

  const pantos: readonly Pantograph[] = [pantograph(M), pantograph(M)];
  for (const p of pantos) drawHierarchy(p.group, style, { threshold: 25 });
  pantos[0].group.position.set(5.6, LOCO.roofTop, 0);
  pantos[1].group.position.set(-5.6, LOCO.roofTop, 0);
  pantos[1].group.scale.x = -1;
  part("pantoFront", pantos[0].group, [0.8, 4.6, 0], [0, 0.3, 0.5], 0.1);
  part("pantoRear", pantos[1].group, [-0.8, 4.6, 0], [0, 0.3, 0.5], 0.1);
  yield;

  const cabFront = drawnPart((g) => g.add(cabNose(M)), style, { threshold: 22 });
  cabFront.position.x = bodyHalf;
  part("cabFront", cabFront, [2.6, 0.5, 0], [0.34, 3.93, 0], 0.02);
  yield;
  const cabRear = drawnPart((g) => {
    const c = cabNose(M);
    c.scale.x = -1;
    g.add(c);
  }, style, { threshold: 22 });
  cabRear.position.x = -bodyHalf;
  part("cabRear", cabRear, [-2.6, 0.5, 0], [-0.55, 3.0, hw * 0.4], 0.02);
  yield;

  // The two bogie frames are the same frame: built once, the rear one shares its geometry.
  const axles: WheelReg[] = [];
  const frameFront = drawnPart((g) => bogie(g, M, 0, { axles: 3, pitch: 1.9, radius: 0.546, frameY: 0.76, frameLen: 4.7, heavy: true }, axles), style, { threshold: 22 });
  yield;
  for (const e of [1, -1]) {
    const frame = e > 0 ? frameFront : cloneShared(frameFront);
    frame.position.x = e * LOCO.bogieCentres;
    part(e > 0 ? "bogieFront" : "bogieRear", frame, [e * 0.9, -2.4, 0], [e * -1.2, 1.1, GAUGE_Z + 0.35], 0.12);
    const set = new Group();
    set.position.x = e * LOCO.bogieCentres;
    addWheels(set, axles, style, wheels);
    part(e > 0 ? "wheelsFront" : "wheelsRear", set, [e * 0.9, -4.3, 0.6], [axles[1].x, 0.55, GAUGE_Z + 0.12], 0.18);
  }
  yield;

  const tanks = drawnPart((g) => {
    for (const s of [-1, 1]) cyl(g, M.x, 0.24, 3.4, 0, 0.72, s * 0.95, "x", 16);
    box(g, M.x, 1.4, 0.6, 1.6, -2.4, 0.78, 0, 0.04);
  }, style, { threshold: 22 });
  part("tanks", tanks, [0, -1.6, 2.6], [1.2, 0.72, 1.2], 0.15);

  // Dimension lines (general-arrangement style): overall length below the rails, height ahead of the nose.
  const dims = new Group();
  const dimPts: number[] = [];
  const seg = (a: readonly [number, number, number], b: readonly [number, number, number]): void => {
    dimPts.push(...a, ...b);
  };
  const x0 = -locoLength / 2;
  const x1 = locoLength / 2;
  const y = -0.75;
  const z = hw + 0.4;
  seg([x0, y, z], [x1, y, z]);
  for (const x of [x0, x1]) seg([x, y - 0.25, z], [x, 0.9, z]);
  for (const [x, d] of [[x0, 1], [x1, -1]] as const) {
    seg([x, y, z], [x + d * 0.5, y + 0.14, z]);
    seg([x, y, z], [x + d * 0.5, y - 0.14, z]);
  }
  const hx = x1 + 1.3;
  const top = LOCO.roofTop + 0.16;
  seg([hx, 0, z], [hx, top, z]);
  for (const yy of [0, top]) seg([hx - 0.35, yy, z], [x1 + 0.2, yy, z]);
  for (const [yy, d] of [[0, 1], [top, -1]] as const) {
    seg([hx, yy, z], [hx - 0.14, yy + d * 0.5, z]);
    seg([hx, yy, z], [hx + 0.14, yy + d * 0.5, z]);
  }
  const dimGeo = new BufferGeometry();
  dimGeo.setAttribute("position", new Float32BufferAttribute(dimPts, 3));
  const dimLines = new LineSegments(dimGeo, style.dim);
  dimLines.renderOrder = 5;
  dims.add(dimLines);
  loco.add(dims);
  const dimAnchors: Readonly<Record<DimAnchorId, Vector3>> = { length: new Vector3(0, y - 0.55, z), height: new Vector3(hx + 0.2, top / 2, z) };
  yield;

  // Coaches, coupled behind the locomotive: the first is built, the rest share its geometry.
  const coachList: Array<{ readonly obj: Object3D; readonly baseX: number }> = [];
  let cursor = -locoLength - 0.7;
  let first: { readonly obj: Group; readonly length: number } | null = null;
  for (let i = 0; i < coaches; i++) {
    let obj: Object3D;
    let length: number;
    if (!first) {
      const built: { coach?: { readonly obj: Group; readonly length: number } } = {};
      yield* coachSteps(style, wheels, built);
      if (!built.coach) throw new Error("rig: coachSteps finished without building a coach");
      first = built.coach;
      ({ obj, length } = first);
      yield;
    } else {
      obj = cloneShared(first.obj);
      length = first.length;
      registerWheels(obj, wheels);
    }
    const baseX = cursor - length / 2;
    obj.position.x = baseX;
    group.add(obj);
    coachList.push({ obj, baseX });
    cursor -= length + 0.2;
  }

  const tmp = new Vector3();
  const rigParts = parts as Record<RigPartId, RigPart>;
  out.rig = {
    group,
    parts: rigParts,
    coaches: coachList,
    setExplode(t: number): void {
      for (const p of Object.values(rigParts)) {
        const k = clamp((t - p.delay) / (1 - p.delay));
        const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
        p.obj.position.copy(p.base).addScaledVector(p.explode, e);
      }
    },
    setPantograph(t: number): void {
      pantos[1].set(t);
      pantos[0].set(0);
    },
    /** 0 = coaches waiting off to the left, 1 = coupled. `shown` caps how many coaches draw (quality). */
    setCoupling(t: number, shown = coachList.length): void {
      coachList.forEach((c, i) => {
        const k = clamp(t * 1.25 - i * 0.12);
        const e = 1 - (1 - k) ** 3;
        c.obj.position.x = c.baseX - (1 - e) * (90 + i * 26);
        c.obj.visible = k > 0.001 && i < shown;
      });
    },
    /** Turn every wheel for where it now stands on the track. */
    turnWheels(): void {
      for (const w of wheels) {
        if (w.obj.parent && !w.obj.parent.visible) continue; // a coach not yet on screen
        w.obj.getWorldPosition(tmp);
        w.obj.rotation.z = (w.side > 0 ? -1 : 1) * (tmp.x / w.r);
      }
    },
    anchor(id: PartId, v = new Vector3()): Vector3 {
      const p = rigParts[id];
      return p.obj.localToWorld(v.copy(p.anchor));
    },
    dimAnchor(which: DimAnchorId, v = new Vector3()): Vector3 {
      return loco.localToWorld(v.copy(dimAnchors[which]));
    },
    setDims(t: number): void {
      style.dim.opacity = t * 0.95;
      dims.visible = t > 0.001;
    },
    /** Light one part's edges in steel (null clears). */
    setHighlight(id: RigPartId | null): void {
      for (const p of Object.values(rigParts)) {
        const lit = p.id === id;
        p.obj.traverse((o) => {
          if (o instanceof LineSegments) {
            const base = baseOf(o);
            if (base) o.material = lit ? style.accent : base;
          }
        });
      }
    },
    /** The headlight lens's centre in the front cab's frame (for the Night beam, J5). */
    headlight: new Vector3(0.36, 3.93, 0),
    cabFront,
  };
}

/** Build the whole rig at once (the bake step, tests). */
export function buildRig(style: LineStyle, opts: { readonly coaches?: number } = {}): Rig {
  const out: { rig?: Rig } = {};
  for (const _step of rigSteps(style, opts, out)) {
    // Draining the generator builds the whole rig in one go.
  }
  if (!out.rig) throw new Error("rig: buildRig finished without producing a rig");
  return out.rig;
}
