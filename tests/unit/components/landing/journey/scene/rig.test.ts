import { Box3, Color, Group, LineSegments, Mesh, Object3D, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { RIG_PARTS, allParts, buildRig, rigSteps, type Rig } from "@/components/landing/journey/scene/rig";
import { baseOf, createStyle, edgesOf, type LineStyle } from "@/components/landing/journey/scene/lines";
import { coachSteps, drawnPart, drawnPartSteps } from "@/components/landing/journey/scene/rig-parts";
import { box } from "@/components/landing/journey/scene/util";
import { CALLOUT_PARTS } from "@/components/landing/journey/train-parts";

const INK = new Color(0, 0, 0);
const style: LineStyle = createStyle({ ground: INK, ink: INK, steel: INK, steelText: INK });
const rig: Rig = buildRig(style, { coaches: 3 });

const offset = (id: keyof Rig["parts"]) => rig.parts[id].obj.position.clone().sub(rig.parts[id].base);

describe("the drawn train's rig", () => {
  it("has the ten labelled parts, and the tanks", () => {
    expect(Object.keys(rig.parts).sort()).toEqual([...CALLOUT_PARTS, "tanks"].sort());
  });

  it("exposes the locomotive and the trailing pantograph's head, for the scan and the glow (J5)", () => {
    expect(rig.loco.parent).toBe(rig.group);
    for (const id of RIG_PARTS) expect(rig.parts[id].obj.parent).toBe(rig.loco);
    const chain: Object3D[] = [];
    for (let o: Object3D | null = rig.pantoHead; o; o = o.parent) chain.push(o);
    expect(chain).toContain(rig.parts.pantoRear.obj);
  });

  it("refuses a rig missing any of its eleven parts", () => {
    const ten = Object.fromEntries(Object.entries(rig.parts).filter(([id]) => id !== "tanks"));
    expect(() => allParts(ten)).toThrow(/tanks/);
    expect(Object.keys(allParts(rig.parts)).sort()).toEqual([...RIG_PARTS].sort());
  });

  it("takes each part apart along its own line, the roof a little after the shell", () => {
    rig.setExplode(1);
    expect(offset("shell").toArray().map((v) => +v.toFixed(6))).toEqual([0, 0.9, 0]);
    expect(offset("roof").y).toBeCloseTo(2.8, 6);
    rig.setExplode(0.04);
    expect(offset("shell").y).toBeGreaterThan(0);
    expect(offset("roof").y).toBeCloseTo(0, 9);
    rig.setExplode(0);
    for (const id of CALLOUT_PARTS) expect(offset(id).length()).toBeCloseTo(0, 9);
  });

  it("brings its coaches in from the left, as many as it is allowed to show", () => {
    rig.setCoupling(0);
    expect(rig.coaches.every((c) => !c.obj.visible)).toBe(true);
    rig.setCoupling(1);
    expect(rig.coaches.map((c) => c.obj.visible)).toEqual([true, true, true]);
    expect(rig.coaches.map((c) => c.obj.position.x)).toEqual(rig.coaches.map((c) => c.baseX));
    rig.setCoupling(1, 1);
    expect(rig.coaches.map((c) => c.obj.visible)).toEqual([true, false, false]);
  });

  it("raises the trailing pantograph to the wire and leaves the leading one folded", () => {
    const top = (id: "pantoFront" | "pantoRear") => new Box3().setFromObject(rig.parts[id].obj).max.y;
    rig.setPantograph(0);
    const [front0, rear0] = [top("pantoFront"), top("pantoRear")];
    rig.setPantograph(1);
    expect(top("pantoRear")).toBeGreaterThan(rear0 + 0.5);
    expect(top("pantoFront")).toBeCloseTo(front0, 6);
    rig.setPantograph(0);
  });

  it("lights one part in steel and gives every edge its own ink back, even on a shared clone", () => {
    rig.setHighlight("bogieRear");
    expect(edgesOf(rig.parts.bogieRear.obj).every((e) => e.material === style.accent)).toBe(true);
    expect(edgesOf(rig.parts.bogieFront.obj).some((e) => e.material === style.accent)).toBe(false);
    rig.setHighlight(null);
    expect(edgesOf(rig.parts.bogieRear.obj).every((e) => e.material === baseOf(e))).toBe(true);
  });

  it("gives every labelled part a finite leader anchor", () => {
    rig.group.updateMatrixWorld(true);
    for (const id of CALLOUT_PARTS) expect(rig.anchor(id).toArray().every(Number.isFinite)).toBe(true);
  });

  it("turns the wheels as the train moves along the track", () => {
    const wheels: Group[] = [];
    rig.parts.wheelsFront.obj.traverse((o) => {
      if (o instanceof Group && typeof o.userData.wheel === "object") wheels.push(o);
    });
    expect(wheels.length).toBeGreaterThan(0);
    rig.group.position.x = 3;
    rig.group.updateMatrixWorld(true);
    rig.turnWheels();
    const turned = wheels[0].rotation.z;
    rig.group.position.x = 0;
    rig.group.updateMatrixWorld(true);
    rig.turnWheels();
    expect(turned).not.toBeCloseTo(wheels[0].rotation.z, 3);
  });

  it("fades the dimension lines with setDims", () => {
    rig.setDims(0.5);
    expect(style.dim.opacity).toBeCloseTo(0.475, 9);
    rig.setDims(0);
  });

  it("builds a part at a time, and only hands over the rig once it is whole", () => {
    const out: { rig?: Rig } = {};
    let steps = 0;
    const build = rigSteps(style, { coaches: 1 }, out);
    for (let next = build.next(); !next.done; next = build.next()) {
      steps += 1;
      expect(out.rig).toBeUndefined();
    }
    expect(steps).toBeGreaterThanOrEqual(9);
    expect(out.rig?.coaches).toHaveLength(1);
  });

  it("yields between each shell's merged fill and its edges, the two costliest steps split (spec §3.H: ≤ 61 ms each)", () => {
    // before the split: 10 steps for a one-coach rig (and 1 in the coach's own); the loco's shell and the coach's body
    // each gain one
    expect([...rigSteps(style, { coaches: 1 }, {})]).toHaveLength(12);
    expect([...coachSteps(style, [], {})]).toHaveLength(2);
  });

  it("draws a part a step at a time exactly as at once: the fill merged first, then after a yield its edges", () => {
    const build = (g: Group) => {
      box(g, style.fill, 1, 2, 3, 0.5, 0, 0);
      box(g, style.fill, 2, 1, 1, -1, 1, 0);
    };
    const whole = drawnPart(build, style, { threshold: 22 });
    const out: { part?: Group } = {};
    const steps = drawnPartSteps(build, style, out, { threshold: 22 });
    expect(steps.next().done).toBe(false);
    expect(out.part).toBeUndefined();
    expect(steps.next().done).toBe(true);
    const positions = (g: Group | undefined) => (g?.children ?? []).map((c) => (c instanceof Mesh || c instanceof LineSegments ? [...c.geometry.getAttribute("position").array] : []));
    expect(positions(out.part)).toEqual(positions(whole));
  });

  it("draws only hairlines over fills", () => {
    const kinds = new Set<string>();
    rig.group.traverse((o) => {
      if (o instanceof LineSegments) kinds.add("lines");
    });
    expect(kinds.has("lines")).toBe(true);
    expect(new Vector3().copy(rig.headlight).toArray()).toEqual([0.36, 3.93, 0]);
  });
});
