import { Color, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Texture } from "three";
import { describe, expect, it, vi } from "vitest";
import { anatomyPose } from "@/components/landing/journey/pose";
import { createBeam } from "@/components/landing/journey/scene/beam";
import { buildDeparture } from "@/components/landing/journey/scene/departure";
import { QUALITY, applyLive, compileUnlessLost, dprFor, pickables, qualityAt, texturesIn, toLinePalette, viewport, watchContext, weightsFor, withEverythingShown } from "@/components/landing/journey/scene/engine";
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

  it("shows everything, culls nothing for one draw, then puts every object back as it was, even when the draw throws", () => {
    const root = new Group();
    const hidden = new Group();
    hidden.visible = false;
    const unculled = new Mesh();
    unculled.frustumCulled = false;
    const inner = new Mesh();
    hidden.add(inner);
    root.add(hidden, unculled);
    const during: Array<[boolean, boolean]> = [];
    withEverythingShown(root, () => root.traverse((o) => during.push([o.visible, o.frustumCulled])));
    expect(during).toEqual(Array.from({ length: 4 }, () => [true, false]));
    expect([root.visible, hidden.visible, inner.visible, unculled.visible]).toEqual([true, false, true, true]);
    expect([root.frustumCulled, hidden.frustumCulled, inner.frustumCulled, unculled.frustumCulled]).toEqual([true, true, true, false]);
    expect(() =>
      withEverythingShown(root, () => {
        throw new Error("lost");
      }),
    ).toThrow("lost");
    expect(hidden.visible).toBe(false);
  });

  it("finds every texture the scene's materials map, each once", () => {
    const map = new Texture();
    const root = new Group();
    root.add(new Mesh(undefined, new MeshBasicMaterial({ map })), new Mesh(undefined, [new MeshBasicMaterial(), new MeshBasicMaterial({ map })]));
    expect(texturesIn(root)).toEqual([map]);
    expect(texturesIn(parts.world.scene)).toHaveLength(3); // the nameboard, the glow and the pool
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

describe("the engine and a lost GPU (spec §4: every failure settles on the still, never hangs)", () => {
  const lostEvent = () => new Event("webglcontextlost", { cancelable: true });

  it("asks for the context back on a loss, reports the loss and the return, and hears nothing once removed", () => {
    const canvas = new EventTarget();
    const heard: string[] = [];
    const stop = watchContext(canvas, (state) => heard.push(state));
    const lost = lostEvent();
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(true);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(heard).toEqual(["lost", "restored"]);
    stop();
    const after = lostEvent();
    canvas.dispatchEvent(after);
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(heard).toEqual(["lost", "restored"]);
    expect(after.defaultPrevented).toBe(false);
  });

  it("stops waiting on the shaders when the context drops mid-compile (a lost program never reports ready)", async () => {
    const canvas = new EventTarget();
    const warming = compileUnlessLost(() => new Promise<never>(() => undefined), canvas, () => false);
    canvas.dispatchEvent(lostEvent());
    await expect(warming).resolves.toBeUndefined();
  });

  it("settles when the compile finishes or fails, and skips it when the context is already gone", async () => {
    const canvas = new EventTarget();
    await expect(compileUnlessLost(() => Promise.resolve("scene"), canvas, () => false)).resolves.toBeUndefined();
    await expect(compileUnlessLost(() => Promise.reject(new Error("no parallel compile")), canvas, () => false)).resolves.toBeUndefined();
    await expect(
      compileUnlessLost(() => {
        throw new Error("thrown before a promise");
      }, canvas, () => false),
    ).resolves.toBeUndefined();
    const compile = vi.fn(() => new Promise<never>(() => undefined));
    await expect(compileUnlessLost(compile, canvas, () => true)).resolves.toBeUndefined();
    expect(compile).not.toHaveBeenCalled();
  });
});
