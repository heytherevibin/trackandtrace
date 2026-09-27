import { Color, Fog, Mesh, Raycaster, SRGBColorSpace, Vector2, WebGLRenderer, type PerspectiveCamera, type Vector3 } from "three";
import { WEBGL_EVENT, emit, type WebglDetail } from "../journey-events";
import type { Pose } from "../pose";
import { createBeam, poolTexture, type Beam } from "./beam";
import { boardFace, buildDeparture, type Departure } from "./departure";
import { createFit, projectTo, type Fit, type Rect, type ScreenPoint } from "./fit";
import { createGlow, glowTexture, type Glow } from "./glow";
import { DAY_OPACITY, NIGHT_OPACITY, restyle, type LineOpacity, type Palette } from "./lines";
import { smoothstep } from "./math";
import type { Rgb, ScenePalette } from "./palette";
import { applyPose } from "./apply-pose";
import { isRigPart, type Rig, type RigPartId } from "./rig";
import { createScan, type Scan } from "./scan";
import { buildWorldAsync, type Pause, type World } from "./world";

// The live drawing's engine (spec §3.B; prototype v3's scene/engine.js): one WebGL canvas fixed over the page,
// drawing each visible stage into its own scissored rectangle. A stage supplies `update`, which poses the rig and the
// camera for its rectangle; the engine draws only while a stage shows. It is built a part at a time, compiles its
// shaders in the background, steps quality (resolution, coaches, Night effects), takes a new palette in place, and
// tells the page when the GPU drops or restores its context. It is kept for one startJourney (J5-4).

/** 0 full, 1 lighter (1.5×, two coaches, Night effects off), 2 lightest (1×, one coach). */
export const QUALITY = [
  { dpr: 2, coaches: Number.POSITIVE_INFINITY, effects: true },
  { dpr: 1.5, coaches: 2, effects: false },
  { dpr: 1, coaches: 1, effects: false },
] as const;
export type Quality = (typeof QUALITY)[number];

export function qualityAt(level: number): Quality {
  return QUALITY[Math.max(0, Math.min(QUALITY.length - 1, level))] ?? QUALITY[0];
}

export function dprFor(level: number, deviceDpr: number): number {
  return Math.min(deviceDpr || 1, qualityAt(level).dpr);
}

export interface ViewBox {
  readonly x: number;
  readonly w: number;
  readonly top: number;
  readonly h: number;
  /** The rectangle's bottom edge in GL's coordinates (from the canvas's foot). */
  readonly glY: number;
}

/** Where a stage draws, or null when it is off screen or a sliver. A bleeding stage spans the window's width. */
export function viewport(r: { readonly left: number; readonly top: number; readonly bottom: number; readonly width: number; readonly height: number }, bleed: boolean, vw: number, vh: number): ViewBox | null {
  if (r.bottom <= 0 || r.top >= vh || r.height < 2 || r.width < 2) return null;
  return { x: bleed ? 0 : r.left, w: bleed ? vw : r.width, top: r.top, h: r.height, glY: vh - r.bottom };
}

export interface ViewContext {
  readonly camera: PerspectiveCamera;
  readonly rect: Rect;
  readonly aspect: number;
  readonly quality: Quality;
  readonly night: boolean;
}
export interface View {
  readonly el: Element;
  readonly bleed: boolean;
  update(ctx: ViewContext): void;
  after?(): void;
}

export interface LiveParts {
  readonly world: World;
  readonly scan: Scan;
  readonly departure: Departure;
  readonly glow: Glow;
  readonly beam: Beam;
}

/** One frame's pose for everything live: the shared rig and camera (applyPose), then the scan, the line side, and
 * the Night glow and beam (Night at full quality only; the beam lights as the pantograph reaches the wire). */
export function applyLive(parts: LiveParts, camera: PerspectiveCamera, pose: Pose, quality: Quality, night: boolean): void {
  applyPose(parts.world, camera, pose, { coaches: quality.coaches });
  parts.departure.group.visible = pose.lineside;
  parts.scan.set(pose.scan);
  const effects = night && quality.effects;
  parts.glow.set(effects, pose.panto > 0.6);
  parts.beam.set(effects, pose.panto > 0.6 ? smoothstep(0.6, 1, pose.panto) : 0);
}

/** The locomotive's own fills, each carrying its part id: what a pointer can land on. */
export function pickables(rig: Rig): Mesh[] {
  const out: Mesh[] = [];
  rig.loco.traverse((o) => {
    if (o instanceof Mesh && typeof o.userData.part === "string") out.push(o);
  });
  return out;
}

const srgb = ({ r, g, b }: Rgb): Color => new Color().setRGB(r, g, b, SRGBColorSpace);

export function toLinePalette(p: ScenePalette): Palette {
  return { ground: srgb(p.ground), ink: srgb(p.ink), steel: srgb(p.steel), steelText: srgb(p.steelText) };
}

export function weightsFor(night: boolean): LineOpacity {
  return night ? NIGHT_OPACITY : DAY_OPACITY;
}

export interface EngineOptions {
  readonly palette: ScenePalette;
  readonly coaches: number;
  readonly words: { readonly platform: string; readonly departures: string };
  readonly family: string;
}

export interface Engine {
  readonly world: World;
  readonly fit: Fit;
  /** The canvas it draws on. scene/live.ts made it and owns the element (its `hidden`, its removal); the engine owns
   * only its drawing buffer and WebGL context. */
  readonly canvas: HTMLCanvasElement;
  addView(id: string, view: View): void;
  removeView(id: string): void;
  /** Draws every visible stage now (or clears the canvas when none shows). */
  frame(): void;
  live(pose: Pose, quality: Quality, night: boolean): void;
  setPalette(palette: ScenePalette): void;
  night(): boolean;
  setQuality(level: number): void;
  quality(): number;
  project(point: Vector3, rect: Rect): ScreenPoint;
  pick(clientX: number, clientY: number, rect: Rect, camera: PerspectiveCamera): RigPartId | null;
  /** The share of an element's box the drawing inked, read in the same task as a fresh frame (the dev probe, J5-13). */
  inked(el: Element): number;
  dispose(): void;
}

export async function createEngine(canvas: HTMLCanvasElement, options: EngineOptions, pause: Pause): Promise<Engine> {
  const world = await buildWorldAsync(toLinePalette(options.palette), { coaches: options.coaches, opacity: weightsFor(options.palette.night) }, pause);
  await pause();
  const { scene, rig, camera } = world;
  const departure = buildDeparture(world.style, boardFace(options.words, options.family));
  scene.add(departure.group);
  const parts: LiveParts = { world, scan: createScan(rig, world.style), departure, glow: createGlow(rig, glowTexture()), beam: createBeam(rig, poolTexture()) };
  const fit = createFit(rig);
  const targets = pickables(rig);
  await pause();

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(new Color(0, 0, 0), 0);
  renderer.autoClear = false;
  renderer.localClippingEnabled = true;
  const views = new Map<string, View>();
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  let size = { w: 0, h: 0 };
  let drewLast = false;
  let level = 0;
  let night = options.palette.night;
  let lost = false;

  const onLost = (event: Event) => {
    event.preventDefault(); // ask for the context back
    lost = true;
    emit<WebglDetail>(WEBGL_EVENT, "lost");
  };
  const onRestored = () => {
    lost = false;
    size = { w: 0, h: 0 };
    emit<WebglDetail>(WEBGL_EVENT, "restored");
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  renderer.setPixelRatio(dprFor(level, window.devicePixelRatio));

  const resize = () => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === size.w && h === size.h) return;
    size = { w, h };
    renderer.setSize(w, h, false);
  };

  const setPalette = (p: ScenePalette) => {
    const line = toLinePalette(p);
    restyle(world.style, line, weightsFor(p.night));
    if (scene.fog instanceof Fog) scene.fog.color.copy(line.ground);
    parts.scan.setColors(srgb(p.scanDark), srgb(p.scanLight), line.steelText, p.night);
    parts.glow.setColor(line.steelText);
    parts.beam.setColor(line.steelText);
    departure.setInk(p.ink);
    night = p.night;
  };
  setPalette(options.palette);

  function frame(): void {
    if (lost) return;
    resize();
    const shown = [...views.values()].flatMap((v) => {
      const box = viewport(v.el.getBoundingClientRect(), v.bleed, size.w, size.h);
      return box ? [{ v, box }] : [];
    });
    if (!shown.length) {
      if (drewLast) {
        renderer.setScissorTest(false);
        renderer.clear();
        drewLast = false;
      }
      return;
    }
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    for (const { v, box } of shown) {
      camera.aspect = box.w / box.h;
      v.update({ camera, rect: { x: box.x, y: box.top, w: box.w, h: box.h }, aspect: camera.aspect, quality: qualityAt(level), night });
      camera.updateProjectionMatrix();
      rig.turnWheels();
      renderer.setViewport(box.x, box.glY, box.w, box.h);
      renderer.setScissor(box.x, box.glY, box.w, box.h);
      renderer.render(scene, camera);
      v.after?.();
    }
    drewLast = true;
  }

  /** Compiles every shader off the main thread where the browser can (KHR_parallel_shader_compile). */
  const warm = async () => {
    try {
      parts.scan.set(0.5);
      parts.beam.set(true, 1);
      departure.group.visible = true;
      await renderer.compileAsync(scene, camera);
    } catch {
      // no parallel compile: the shaders compile on the first draw instead
    } finally {
      parts.scan.set(1);
      parts.beam.set(false, 0);
      departure.group.visible = false;
    }
  };
  await pause();
  await warm();

  return {
    world,
    fit,
    canvas,
    addView: (id, view) => {
      views.set(id, view);
    },
    removeView: (id) => {
      views.delete(id);
    },
    frame,
    live: (pose, quality, isNight) => applyLive(parts, camera, pose, quality, isNight),
    setPalette,
    night: () => night,
    setQuality: (next) => {
      level = Math.max(0, Math.min(QUALITY.length - 1, next));
      renderer.setPixelRatio(dprFor(level, window.devicePixelRatio));
      size = { w: 0, h: 0 }; // re-apply the drawing buffer's size at the new resolution
    },
    quality: () => level,
    project: (point, rect) => projectTo(point, camera, rect),
    pick: (clientX, clientY, rect, from) => {
      ndc.set(((clientX - rect.x) / rect.w) * 2 - 1, -(((clientY - rect.y) / rect.h) * 2 - 1));
      raycaster.setFromCamera(ndc, from);
      const part: unknown = raycaster.intersectObjects(targets, false)[0]?.object.userData.part;
      return typeof part === "string" && isRigPart(part) ? part : null;
    },
    inked: (el) => {
      frame();
      const gl = renderer.getContext();
      const r = el.getBoundingClientRect();
      const dpr = renderer.getPixelRatio();
      const top = Math.max(0, r.top);
      const bottom = Math.min(size.h, r.bottom);
      const x = Math.max(0, Math.floor(r.left * dpr));
      const w = Math.min(Math.floor(size.w * dpr) - x, Math.floor(r.width * dpr));
      const h = Math.floor((bottom - top) * dpr);
      if (w <= 0 || h <= 0) return 0;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(x, Math.floor((size.h - bottom) * dpr), w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let inked = 0;
      for (let i = 3; i < px.length; i += 4) if ((px[i] ?? 0) > 0) inked += 1;
      return inked / (w * h);
    },
    dispose: () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      views.clear();
      renderer.dispose();
      renderer.forceContextLoss(); // the element itself is scene/live.ts's to remove
    },
  };
}
