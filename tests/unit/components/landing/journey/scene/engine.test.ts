import { Color, Mesh, PerspectiveCamera, Texture } from "three";
import { describe, expect, it } from "vitest";
import { anatomyPose } from "@/components/landing/journey/pose";
import { createBeam } from "@/components/landing/journey/scene/beam";
import { buildDeparture } from "@/components/landing/journey/scene/departure";
import { QUALITY, applyLive, dprFor, pickables, qualityAt, toLinePalette, viewport, weightsFor } from "@/components/landing/journey/scene/engine";
import { createGlow } from "@/components/landing/journey/scene/glow";
import { NIGHT_OPACITY } from "@/components/landing/journey/scene/lines";
import { createScan } from "@/components/landing/journey/scene/scan";
import { buildWorld } from "@/components/landing/journey/scene/world";

const INK = new Color(0, 0, 0);
const world = buildWorld({ ground: INK, ink: INK, steel: INK, steelText: INK }, { coaches: 3 });
const parts = {
  world,
  scan: createScan(world.rig, world.style),
  departure: buildDeparture(world.style, { texture: new Texture(), paint: () => undefined }),
  glow: createGlow(world.rig, new Texture()),
  beam: createBeam(world.rig, new Texture()),
};
world.scene.add(parts.departure.group);
const camera = new PerspectiveCamera();

describe("the engine's pure pieces (spec §3.B–C; v3's engine.js)", () => {
  it("draws a stage only while it is on screen and bigger than a sliver; a bleeding stage takes the window's width", () => {
    expect(viewport({ left: 40, top: -900, bottom: -1, width: 800, height: 899 }, false, 1280, 800)).toBeNull();
    expect(viewport({ left: 40, top: 800, bottom: 1200, width: 800, height: 400 }, false, 1280, 800)).toBeNull();
    expect(viewport({ left: 40, top: 100, bottom: 101, width: 800, height: 1 }, false, 1280, 800)).toBeNull();
    expect(viewport({ left: 40, top: 100, bottom: 500, width: 800, height: 400 }, false, 1280, 800)).toEqual({ x: 40, w: 800, top: 100, h: 400, glY: 300 });
    expect(viewport({ left: 40, top: 100, bottom: 500, width: 800, height: 400 }, true, 1280, 800)).toEqual({ x: 0, w: 1280, top: 100, h: 400, glY: 300 });
  });

  it("steps quality: resolution 2× → 1.5× → 1×, coaches all → 2 → 1, Night effects only at the top step", () => {
    expect(QUALITY.map((q) => [q.dpr, q.coaches, q.effects])).toEqual([[2, Infinity, true], [1.5, 2, false], [1, 1, false]]);
    expect([dprFor(0, 3), dprFor(1, 3), dprFor(2, 3), dprFor(0, 1)]).toEqual([2, 1.5, 1, 1]);
    expect(qualityAt(9)).toBe(QUALITY[2]);
    expect(qualityAt(-1)).toBe(QUALITY[0]);
  });

  it("poses the live parts from one pose: the scan early, the line side and the Night lights late", () => {
    applyLive(parts, camera, anatomyPose(0.05, 2), QUALITY[0], true);
    expect(parts.departure.group.visible).toBe(false);
    expect(world.rig.group.getObjectByName("beam")?.visible).toBe(false);
    applyLive(parts, camera, anatomyPose(0.95, 2), QUALITY[0], true);
    expect(parts.departure.group.visible).toBe(true);
    expect(world.rig.group.getObjectByName("beam")?.visible).toBe(true);
    applyLive(parts, camera, anatomyPose(0.95, 2), QUALITY[1], true);
    expect(world.rig.group.getObjectByName("beam")?.visible).toBe(false);
    applyLive(parts, camera, anatomyPose(0.95, 2), QUALITY[2], false);
    expect(world.rig.coaches.filter((c) => c.obj.visible)).toHaveLength(1);
  });

  it("picks only the locomotive's own fills, each naming its part", () => {
    const meshes = pickables(world.rig);
    expect(meshes.length).toBeGreaterThan(10);
    for (const m of meshes) {
      expect(m).toBeInstanceOf(Mesh);
      expect(typeof m.userData.part).toBe("string");
    }
  });

  it("turns the scene's palette into the drawing's, and Night into its weights", () => {
    const p = toLinePalette({ night: true, ground: { r: 0, g: 0, b: 0 }, ink: { r: 1, g: 1, b: 1 }, steel: { r: 1, g: 0, b: 0 }, steelText: { r: 0, g: 0, b: 1 }, scanDark: { r: 0, g: 0, b: 0 }, scanLight: { r: 0, g: 0, b: 0 } });
    expect(p.ink.equals(new Color(1, 1, 1))).toBe(true);
    expect(weightsFor(true)).toBe(NIGHT_OPACITY);
  });
});
