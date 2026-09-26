import { Color, Fog, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { STILL_ANATOMY, anatomyPose, terminusPose } from "@/components/landing/journey/pose";
import { applyPose } from "@/components/landing/journey/scene/apply-pose";
import { buildWorld } from "@/components/landing/journey/scene/world";

const INK = new Color(0, 0, 0);
const PALETTE = { ground: INK, ink: INK, steel: INK, steelText: INK };

describe("the drawn train's world", () => {
  const world = buildWorld(PALETTE, { coaches: 3 });

  it("stands the rig on its line under fog, with a camera to pose", () => {
    expect(world.scene.fog).toBeInstanceOf(Fog);
    expect(world.rig.group.parent).toBe(world.scene);
    expect(world.scene.getObjectByName("wires")).toBeDefined();
    expect(world.camera.near).toBe(0.5);
    expect(world.camera.far).toBe(900);
  });

  it("poses the still chapter: apart, no coaches, no wire, the camera on the target", () => {
    const pose = anatomyPose(STILL_ANATOMY, 2);
    applyPose(world, world.camera, pose);
    expect(world.rig.parts.shell.obj.position.y - world.rig.parts.shell.base.y).toBeCloseTo(0.9, 6);
    expect(world.rig.coaches.some((c) => c.obj.visible)).toBe(false);
    expect(world.scene.getObjectByName("wires")?.visible).toBe(false);
    expect(world.camera.fov).toBe(30);
    const looking = world.camera.getWorldDirection(new Vector3());
    const toTarget = new Vector3(...pose.target).sub(world.camera.position).normalize();
    expect(looking.dot(toTarget)).toBeCloseTo(1, 6);
  });

  it("poses the terminus: coupled, the wire up, the train arrived", () => {
    applyPose(world, world.camera, terminusPose(1, 2));
    expect(world.rig.coaches.every((c) => c.obj.visible)).toBe(true);
    expect(world.scene.getObjectByName("wires")?.visible).toBe(true);
    expect(world.rig.group.position.x).toBeCloseTo(0, 9);
  });
});
