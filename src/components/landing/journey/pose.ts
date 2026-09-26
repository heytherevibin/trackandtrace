import { clamp, easeInOutCubic, easeOutCubic, lerp, smoothstep } from "./scene/math";

// The drawing chapter as a pure function of its scroll progress, 0..1 (prototype v3's anatomy-pose.js): the
// locomotive is scanned into its drawing while it turns, comes apart into its labelled parts, goes back together in
// side elevation with its dimensions, takes its coaches, raises the pantograph to the wire and pulls away. Also the
// terminus arrival. The bake poses the still drawings with these (J4); the live drawing plays them (J5).

export type Vec3 = readonly [number, number, number];

export interface Phases {
  readonly scan: number;
  readonly explode: number;
  readonly callouts: number;
  readonly side: number;
  readonly dims: number;
  readonly couple: number;
  readonly panto: number;
  readonly drive: number;
  readonly follow: number;
}

/** One frame of the drawn train: the rig's state and the camera's. */
export interface Pose {
  readonly scan: number;
  readonly explode: number;
  readonly callouts: number;
  readonly dims: number;
  readonly couple: number;
  readonly panto: number;
  /** The whole train's offset along the track, in metres. */
  readonly drive: number;
  readonly fov: number;
  readonly target: Vec3;
  readonly pos: Vec3;
  /** Whether the line side (masts, gantry, nameboard) is drawn. */
  readonly lineside: boolean;
}

export type AnatomyPose = Pose & Omit<Phases, "drive">;

/** The rig's x at the locomotive's middle (its nose is at 0). */
const LOCO_CENTRE = -10.15;

/** Where the chapter rests when it is drawn still: fully apart, its callouts showing. */
export const STILL_ANATOMY = 0.4;

function orbit(target: Vec3, yaw: number, pitch: number, dist: number): Vec3 {
  return [target[0] + Math.sin(yaw) * Math.cos(pitch) * dist, target[1] + Math.sin(pitch) * dist, target[2] + Math.cos(yaw) * Math.cos(pitch) * dist];
}

export function anatomyPhases(p: number): Phases {
  const explodeIn = smoothstep(0.12, 0.32, p);
  const explodeOut = smoothstep(0.5, 0.6, p);
  return {
    // a scan gate sweeps the solid steel locomotive into its drawing while it turns
    scan: smoothstep(0.015, 0.13, p),
    explode: explodeIn * (1 - explodeOut),
    callouts: smoothstep(0.26, 0.33, p) * (1 - smoothstep(0.47, 0.53, p)),
    side: easeInOutCubic(smoothstep(0.5, 0.66, p)),
    dims: smoothstep(0.62, 0.67, p) * (1 - smoothstep(0.73, 0.77, p)),
    couple: smoothstep(0.74, 0.86, p),
    panto: smoothstep(0.84, 0.9, p),
    drive: smoothstep(0.88, 1, p),
    // the camera rides along as the train pulls away (so the line side streams past), then lets it go
    follow: smoothstep(0.885, 0.93, p) * (1 - 0.32 * smoothstep(0.955, 1, p)),
  };
}

export function anatomyPose(p: number, aspect: number): AnatomyPose {
  const ph = anatomyPhases(p);
  const phone = aspect < 1;
  const fov = phone ? 46 : 30;
  const turn = easeInOutCubic(smoothstep(0, 0.3, p));
  const yaw = lerp(lerp(0.72, 0.42, turn), 0, ph.side);
  const pitch = lerp(lerp(0.44, 0.3, turn), 0.1, ph.side);
  const drive = 150 * ph.drive * ph.drive;
  // phones: the side elevation shows the whole locomotive before the coaches arrive
  const spanW = phone ? lerp(lerp(19, 29, ph.explode), lerp(24, 30, ph.couple), ph.side) : lerp(lerp(30, 54, ph.explode), 46, ph.side * ph.couple);
  const spanH = phone ? lerp(7, 12, ph.explode) : lerp(9, 17, ph.explode);
  const vfov = (fov * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
  const dist = Math.max(spanW / 2 / Math.tan(hfov / 2), spanH / 2 / Math.tan(vfov / 2)) * 1.08;
  const ride = drive * ph.follow;
  const targetX = lerp(LOCO_CENTRE, LOCO_CENTRE - 12, ph.side * ph.couple) + ride;
  const target: Vec3 = [targetX, lerp(lerp(2.3, 2.6, ph.explode), lerp(2.6, 3.4, ph.couple), ph.side), 0];
  return { ...ph, drive, fov, target, pos: orbit(target, yaw, pitch, dist), lineside: ph.drive > 0.001 };
}

export function terminusPose(p: number, aspect: number): Pose {
  const t = clamp(p / 0.85);
  const phone = aspect < 1;
  const target: Vec3 = [-18, 2.2, 0];
  return {
    scan: 1,
    explode: 0,
    callouts: 0,
    dims: 0,
    couple: 1,
    panto: 1,
    drive: -150 * (1 - easeOutCubic(t)) ** 1.2,
    fov: phone ? 44 : 26,
    target,
    pos: orbit(target, 0.52, 0.16, phone ? 60 : 46),
    lineside: false,
  };
}
