import { Color, LineSegments, Mesh, PerspectiveCamera, Sprite, Texture, type Object3D } from "three";
import { describe, expect, it, vi } from "vitest";
import { STILL_ANATOMY, anatomyPose } from "@/components/landing/journey/pose";
import { createBeam } from "@/components/landing/journey/scene/beam";
import { buildDeparture, type BoardFace } from "@/components/landing/journey/scene/departure";
import { createFit } from "@/components/landing/journey/scene/fit";
import { createGlow } from "@/components/landing/journey/scene/glow";
import { createStyle } from "@/components/landing/journey/scene/lines";
import { buildRig } from "@/components/landing/journey/scene/rig";
import { createScan } from "@/components/landing/journey/scene/scan";

const INK = new Color(0, 0, 0);
const style = createStyle({ ground: INK, ink: INK, steel: INK, steelText: INK });
const rig = buildRig(style, { coaches: 1 });
const under = (o: Object3D, root: Object3D) => {
  for (let a: Object3D | null = o; a; a = a.parent) if (a === root) return true;
  return false;
};

describe("the scan gate (v3's scene/scan.js)", () => {
  const scan = createScan(rig, style);
  const skins: Mesh[] = [];
  rig.loco.traverse((o) => {
    if (o instanceof Mesh && o.material !== style.fill && o.parent instanceof Mesh) skins.push(o);
  });

  it("skins every fill of the locomotive with the steel solid, sharing its geometry", () => {
    expect(skins.length).toBeGreaterThan(10);
    for (const s of skins) expect(s.parent instanceof Mesh && s.geometry === s.parent.geometry).toBe(true);
  });

  it("stands solid before the scan, sweeps nose to tail, and leaves only the drawing", () => {
    scan.set(0);
    expect(skins.every((s) => s.visible)).toBe(true);
    expect(scan.group.visible).toBe(false);
    scan.set(0.5);
    expect(scan.group.visible).toBe(true);
    expect(scan.group.position.x).toBeCloseTo(1.2 + (-21.6 - 1.2) * 0.5, 6);
    scan.set(1);
    expect(skins.some((s) => s.visible)).toBe(false);
    expect(scan.group.visible).toBe(false);
  });
});

describe("the line side (v3's scene/departure.js)", () => {
  const face: BoardFace = { texture: new Texture(), paint: vi.fn() };
  const departure = buildDeparture(style, face);

  it("is hidden until the train pulls away, drawn in hairlines, with the nameboard's face", () => {
    expect(departure.group.visible).toBe(false);
    const materials = departure.group.children.flatMap((c) => (c instanceof LineSegments ? [c.material] : []));
    expect(materials).toEqual([style.near, style.line, style.line]);
    const board = departure.group.children.find((c) => c instanceof Mesh);
    expect(board instanceof Mesh && board.material).toHaveProperty("map", face.texture);
  });

  it("paints the nameboard in the ink it is given", () => {
    departure.setInk({ r: 1, g: 1, b: 1 });
    expect(face.paint).toHaveBeenCalledWith({ r: 1, g: 1, b: 1 });
  });
});

describe("the Night glow and the headlight beam", () => {
  it("hangs the glow on the headlight and on the raised pantograph's head", () => {
    const glow = createGlow(rig, new Texture());
    const sprites: Sprite[] = [];
    rig.group.traverse((o) => {
      if (o instanceof Sprite) sprites.push(o);
    });
    expect(sprites.some((s) => under(s, rig.cabFront))).toBe(true);
    const head = sprites.find((s) => under(s, rig.pantoHead));
    expect(head).toBeDefined();
    glow.set(true, false);
    expect(head?.visible).toBe(false);
    expect((sprites[0]!.material).opacity).toBe(0.9);
    glow.set(false, true);
    expect(head?.visible).toBe(true);
    expect((sprites[0]!.material).opacity).toBe(0);
  });

  it("throws the beam from the front cab, only while lit, and never counts it in the camera fit", () => {
    const camera = new PerspectiveCamera(30, 2, 0.5, 900);
    const pose = anatomyPose(STILL_ANATOMY, 2);
    camera.position.set(...pose.pos);
    camera.lookAt(...pose.target);
    const rect = { x: 0, y: 0, w: 1000, h: 500 };
    const before = createFit(rig).screenBox(camera, rect, 0);
    const beam = createBeam(rig, new Texture());
    expect(beam.group.parent).toBe(rig.cabFront);
    expect(beam.group.userData.noFit).toBe(true);
    beam.set(true, 0);
    expect(beam.group.visible).toBe(false);
    beam.set(true, 1);
    expect(beam.group.visible).toBe(true);
    beam.set(false, 1);
    expect(beam.group.visible).toBe(false);
    expect(createFit(rig).screenBox(camera, rect, 0)).toEqual(before);
  });
});
