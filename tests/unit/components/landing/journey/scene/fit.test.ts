import { BoxGeometry, Color, Group, Mesh, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { STILL_ANATOMY, anatomyPose } from "@/components/landing/journey/pose";
import { createFit, projectTo, type Rect } from "@/components/landing/journey/scene/fit";
import { createStyle } from "@/components/landing/journey/scene/lines";
import { buildRig } from "@/components/landing/journey/scene/rig";

const INK = new Color(0, 0, 0);
const rig = buildRig(createStyle({ ground: INK, ink: INK, steel: INK, steelText: INK }), { coaches: 1 });
const camera = new PerspectiveCamera(30, 2, 0.5, 900);
const rect: Rect = { x: 0, y: 0, w: 1000, h: 500 };

function pose(p: number) {
  const a = anatomyPose(p, 2);
  rig.setExplode(a.explode);
  rig.setPantograph(a.panto);
  camera.fov = a.fov;
  camera.position.set(...a.pos);
  camera.lookAt(...a.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return a;
}

describe("the camera fit (v3's scene/fit.js)", () => {
  it("projects a world point into a view's rectangle", () => {
    pose(STILL_ANATOMY);
    const at = projectTo(new Vector3(...anatomyPose(STILL_ANATOMY, 2).target), camera, rect);
    expect(at.x).toBeCloseTo(500, 0);
    expect(at.y).toBeCloseTo(250, 0);
  });

  it("pulls back and slides until the drawing sits inside the zone the words leave", () => {
    const fit = createFit(rig);
    const a = pose(STILL_ANATOMY);
    const zone = { l: 300, t: 150, r: 700, b: 350 };
    const before = fit.screenBox(camera, rect, a.panto);
    expect(before.r - before.l).toBeGreaterThan(zone.r - zone.l);
    fit.apply(camera, rect, zone, { across: 1, panto: a.panto, target: new Vector3(...a.target) });
    const after = fit.screenBox(camera, rect, a.panto);
    expect(after.l).toBeGreaterThanOrEqual(zone.l - 2);
    expect(after.r).toBeLessThanOrEqual(zone.r + 2);
    expect(after.t).toBeGreaterThanOrEqual(zone.t - 2);
    expect(after.b).toBeLessThanOrEqual(zone.b + 2);
  });

  it("leaves the camera alone when the zone is under 80px tall, or missing", () => {
    const fit = createFit(rig);
    const a = pose(STILL_ANATOMY);
    const at = camera.position.clone();
    fit.apply(camera, rect, { l: 0, t: 0, r: 1000, b: 60 }, { across: 1, panto: a.panto, target: new Vector3(...a.target) });
    fit.apply(camera, rect, null, { across: 1, panto: a.panto, target: new Vector3(...a.target) });
    expect(camera.position.equals(at)).toBe(true);
  });

  it("never counts what hangs on a part but is not the drawing (userData.noFit: the beam)", () => {
    pose(STILL_ANATOMY);
    const before = createFit(rig).screenBox(camera, rect, 0);
    const light = new Group();
    light.userData.noFit = true;
    light.add(new Mesh(new BoxGeometry(80, 80, 80)));
    rig.parts.cabFront.obj.add(light);
    const after = createFit(rig).screenBox(camera, rect, 0);
    rig.parts.cabFront.obj.remove(light);
    expect(after).toEqual(before);
  });
});
