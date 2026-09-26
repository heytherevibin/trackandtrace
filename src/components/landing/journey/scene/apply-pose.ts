import type { PerspectiveCamera } from "three";
import type { Pose } from "../pose";
import type { World } from "./world";

// One frame of a chapter (prototype v3's apply-pose.js), shared by the bake and the live drawing so both show the
// same train. The live drawing also sets its scan and its line side from the same pose (J5).

export function applyPose({ rig, scene }: World, camera: PerspectiveCamera, pose: Pose, { coaches = Infinity }: { readonly coaches?: number } = {}): void {
  rig.setExplode(pose.explode);
  rig.setPantograph(pose.panto);
  rig.setCoupling(pose.couple, coaches);
  rig.setDims(pose.dims);
  rig.group.position.x = pose.drive;
  camera.fov = pose.fov;
  camera.position.set(...pose.pos);
  camera.lookAt(...pose.target);
  const wires = scene.getObjectByName("wires");
  if (wires) wires.visible = pose.couple > 0.5;
}
