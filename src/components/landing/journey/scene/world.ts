import { Fog, PerspectiveCamera, Scene } from "three";
import { buildLine } from "./line-world";
import { createStyle, type LineStyle, type Palette } from "./lines";
import { buildRig, type Rig } from "./rig";

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

export function buildWorld(palette: Palette, { coaches = 3 }: { readonly coaches?: number } = {}): World {
  const style = createStyle(palette);
  const scene = new Scene();
  scene.fog = new Fog(palette.ground, 60, 260);
  scene.add(buildLine(style, LINE_FROM, LINE_TO));
  const rig = buildRig(style, { coaches });
  scene.add(rig.group);
  return { scene, camera: new PerspectiveCamera(30, 1, 0.5, 900), rig, style };
}
