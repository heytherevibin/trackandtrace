import { Fog, PerspectiveCamera, Scene } from "three";
import { buildLine } from "./line-world";
import { DAY_OPACITY, createStyle, type LineOpacity, type LineStyle, type Palette } from "./lines";
import { buildRig, rigSteps, type Rig } from "./rig";

// The drawn train's world (prototype v3's engine.js assemble, without a renderer): the rig on its line, the line
// drawn from 420 m behind to 520 m ahead, fog so the far line fades, and the camera the poses aim. The bake renders
// it (J4); the live drawing adds its renderer, the scan, the departure line side and the Night beam (J5).

export interface World {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly rig: Rig;
  readonly style: LineStyle;
}

export const LINE_FROM = -420;
export const LINE_TO = 520;

function assemble(palette: Palette, style: LineStyle, rig: Rig): World {
  const scene = new Scene();
  scene.fog = new Fog(palette.ground, 60, 260);
  scene.add(buildLine(style, LINE_FROM, LINE_TO));
  scene.add(rig.group);
  return { scene, camera: new PerspectiveCamera(30, 1, 0.5, 900), rig, style };
}

export function buildWorld(palette: Palette, { coaches = 3 }: { readonly coaches?: number } = {}): World {
  const style = createStyle(palette);
  return assemble(palette, style, buildRig(style, { coaches }));
}

/** Waits for the page between steps (a frame, or scheduler.yield). */
export type Pause = () => Promise<void>;

/** The same world, a part at a time (spec §3.B: ≤ 61 ms per step at 4× CPU), for the live drawing (J5). */
export async function buildWorldAsync(palette: Palette, { coaches = 3, opacity = DAY_OPACITY }: { readonly coaches?: number; readonly opacity?: LineOpacity }, pause: Pause): Promise<World> {
  const style = createStyle(palette, opacity);
  const out: { rig?: Rig } = {};
  const steps = rigSteps(style, { coaches }, out);
  while (!steps.next().done) await pause();
  if (!out.rig) throw new Error("world: the rig's steps finished without a rig");
  return assemble(palette, style, out.rig);
}
