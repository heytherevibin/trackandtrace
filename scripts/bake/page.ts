// The bake's browser half (prototype v3's bake-entry.js; spec §3.D): scripts/bake-train-stills.mjs bundles this
// into a page in headless Chromium and calls window.bake once per shape. The train is posed exactly as the page
// poses it; the GPU then decides, pixel by pixel, which stretches of which edges are visible (the fills
// depth-tested with the live drawing's own offset, every edge in its own ID colour), and trace.ts turns only those
// stretches into paths. Build-time only: nothing in the app imports it.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  ShaderMaterial,
  UnsignedByteType,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
  type Object3D,
} from "three";
import { STILL_ANATOMY, anatomyPose, terminusPose } from "@/components/landing/journey/pose";
import { applyPose } from "@/components/landing/journey/scene/apply-pose";
import { FILL_OFFSET, type Palette } from "@/components/landing/journey/scene/lines";
import { buildWorld } from "@/components/landing/journey/scene/world";
import { CALLOUT_PARTS } from "@/components/landing/journey/train-parts";
import { cropBox, half, idColour, idReader, pathsByPart, walkRuns, type EdgeMeta, type LineClass, type Run, type ScreenSeg } from "./trace";

declare global {
  interface Window {
    bake?: (config: BakeConfig) => BakeResult;
  }
}

export interface BakeConfig {
  readonly kind: "anatomy" | "terminus";
  readonly W: number;
  readonly H: number;
  readonly coaches?: number;
  readonly minRun?: number;
  readonly margin?: number;
}

export interface BakeResult {
  readonly viewBox: readonly [number, number, number, number];
  readonly paths: Record<string, string>;
  readonly anchors: Record<string, readonly [number, number]>;
  readonly segments: number;
  readonly runs: number;
}

/** The ID passes never read colour, and the still takes its ink from currentColor. */
const BLACK_PALETTE: Palette = { ground: new Color(0, 0, 0), ink: new Color(0, 0, 0), steel: new Color(0, 0, 0), steelText: new Color(0, 0, 0) };

/** Where a segment crossing the camera's plane is cut, in clip-space w (v3's near clip). */
const NEAR = 0.05;

/** Seen only when it and every ancestor are visible. */
function shown(o: Object3D): boolean {
  for (let a: Object3D | null = o; a; a = a.parent) if (!a.visible) return false;
  return true;
}

function bake({ kind, W, H, coaches = 3, minRun = 1.5, margin = 0.04 }: BakeConfig): BakeResult {
  const world = buildWorld(BLACK_PALETTE, { coaches });
  const { scene, camera, rig, style } = world;
  const aspect = W / H;
  camera.aspect = aspect;
  applyPose(world, camera, kind === "anatomy" ? anatomyPose(STILL_ANATOMY, aspect) : terminusPose(1, aspect));
  camera.updateProjectionMatrix();
  rig.turnWheels();
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld();

  // which part (or coach, or the line side) every object belongs to
  const owner = new Map<Object3D, string>();
  for (const p of Object.values(rig.parts)) p.obj.traverse((o) => owner.set(o, p.id));
  for (const c of rig.coaches) c.obj.traverse((o) => owner.set(o, "coach"));
  const CLS = new Map<LineBasicMaterial, LineClass>([
    [style.line, "line"],
    [style.faint, "faint"],
    [style.near, "near"],
    [style.accent, "line"],
  ]);

  const fills: Mesh[] = [];
  const segs: (readonly [number, number, number, number, number, number])[] = [];
  const meta: EdgeMeta[] = [];
  const a = new Vector3();
  const b = new Vector3();
  scene.traverse((o) => {
    if (!shown(o)) return;
    if (o instanceof Mesh && o.material === style.fill) fills.push(o);
    if (!(o instanceof LineSegments) || !(o.material instanceof LineBasicMaterial)) return;
    const cls = CLS.get(o.material);
    if (!cls) return;
    const pos = o.geometry.getAttribute("position");
    const part = owner.get(o) ?? "world";
    for (let i = 0; i + 1 < pos.count; i += 2) {
      a.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, i + 1).applyMatrix4(o.matrixWorld);
      segs.push([a.x, a.y, a.z, b.x, b.y, b.z]);
      meta.push({ part, cls });
    }
  });

  // pass 1: the fills, depth only, pushed back exactly as the live drawing pushes them
  for (const f of fills) f.layers.enable(1);
  const depthOnly = new MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: FILL_OFFSET.factor, polygonOffsetUnits: FILL_OFFSET.units });
  // pass 2: every edge in its own colour (id i + 1), depth-tested against the fills
  const idPos = new Float32Array(segs.length * 6);
  const idCol = new Float32Array(segs.length * 6);
  segs.forEach((s, i) => {
    idPos.set(s, i * 6);
    const [r, g, bl] = idColour(i);
    idCol.set([r, g, bl, r, g, bl], i * 6);
  });
  const idGeo = new BufferGeometry();
  idGeo.setAttribute("position", new BufferAttribute(idPos, 3));
  idGeo.setAttribute("color", new BufferAttribute(idCol, 3));
  const idMat = new ShaderMaterial({
    vertexShader: "attribute vec3 color; varying vec3 vC; void main(){ vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }",
    depthTest: true,
    depthWrite: false,
  });
  const idLines = new LineSegments(idGeo, idMat);
  idLines.frustumCulled = false;
  idLines.layers.set(2);
  scene.add(idLines);

  // Hidden-line removal needs nothing painted behind the fills: a background would fill the ID pass's pixels.
  if (scene.background !== null) throw new Error("bake: the scene has a background; hidden-line removal needs none");
  const canvas = document.createElement("canvas");
  // No antialiasing: a blended pixel would read as a neighbouring edge's id.
  const renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true });
  // The ID pass must draw over pass 1's depth, so nothing clears between them.
  renderer.autoClear = false;
  const rt = new WebGLRenderTarget(W, H, { type: UnsignedByteType, depthBuffer: true, samples: 0 });
  const px = new Uint8Array(W * H * 4);
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(new Color(0, 0, 0), 0);
    renderer.clear(true, true, true);
    const fog = scene.fog;
    scene.fog = null;
    camera.layers.set(1);
    scene.overrideMaterial = depthOnly;
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
    camera.layers.set(2);
    renderer.render(scene, camera);
    camera.layers.set(0);
    scene.fog = fog;
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, px);
    renderer.setRenderTarget(null);
  } finally {
    scene.remove(idLines);
    idGeo.dispose();
    idMat.dispose();
    depthOnly.dispose();
    rt.dispose();
    renderer.dispose();
  }
  const idAt = idReader(px, W, H);

  // walk each edge across the image; keep the stretches where its own colour survived
  const vp = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const e = vp.elements;
  const clip = (x: number, y: number, z: number): readonly [number, number, number] => [
    e[0] * x + e[4] * y + e[8] * z + e[12],
    e[1] * x + e[5] * y + e[9] * z + e[13],
    e[3] * x + e[7] * y + e[11] * z + e[15],
  ];
  const runs: Run[] = [];
  segs.forEach((s, i) => {
    let p0 = clip(s[0], s[1], s[2]);
    let p1 = clip(s[3], s[4], s[5]);
    if (p0[2] < NEAR && p1[2] < NEAR) return;
    if (p0[2] < NEAR || p1[2] < NEAR) {
      const t = (NEAR - p0[2]) / (p1[2] - p0[2]);
      const q = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, NEAR] as const;
      if (p0[2] < NEAR) p0 = q;
      else p1 = q;
    }
    const seg: ScreenSeg = {
      x0: ((p0[0] / p0[2]) * 0.5 + 0.5) * W,
      y0: (1 - ((p0[1] / p0[2]) * 0.5 + 0.5)) * H,
      x1: ((p1[0] / p1[2]) * 0.5 + 0.5) * W,
      y1: (1 - ((p1[1] / p1[2]) * 0.5 + 0.5)) * H,
    };
    runs.push(...walkRuns(idAt, seg, i, minRun));
  });

  // crop to the train (plus a margin), then write each part's stretches as chained paths
  const box = cropBox(runs, (i) => meta[i].part !== "world", margin, W, H);
  if (!box) throw new Error(`bake ${kind} ${W}×${H}: no stretch of the train is visible — the pose or the depth pass is wrong`);
  const paths = pathsByPart(runs, meta, box);
  const anchors: Record<string, readonly [number, number]> = {};
  if (kind === "anatomy") {
    for (const id of CALLOUT_PARTS) {
      const s = rig.anchor(id).project(camera);
      anchors[id] = [half(((s.x + 1) / 2) * W - box.l), half(((1 - s.y) / 2) * H - box.t)];
    }
  }
  return { viewBox: [0, 0, half(box.r - box.l), half(box.b - box.t)], paths, anchors, segments: segs.length, runs: runs.length };
}

window.bake = bake;
