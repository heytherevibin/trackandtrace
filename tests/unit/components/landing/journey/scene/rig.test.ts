import { Box3, Color, Group, LineSegments, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { buildRig, rigSteps, type Rig } from "@/components/landing/journey/scene/rig";
import { baseOf, createStyle, edgesOf, type LineStyle } from "@/components/landing/journey/scene/lines";
import { CALLOUT_PARTS } from "@/components/landing/journey/train-parts";

const INK = new Color(0, 0, 0);
const style: LineStyle = createStyle({ ground: INK, ink: INK, steel: INK, steelText: INK });
const rig: Rig = buildRig(style, { coaches: 3 });

const offset = (id: keyof Rig["parts"]) => rig.parts[id].obj.position.clone().sub(rig.parts[id].base);

describe("the drawn train's rig", () => {
  it("has the ten labelled parts, and the tanks", () => {
    expect(Object.keys(rig.parts).sort()).toEqual([...CALLOUT_PARTS, "tanks"].sort());
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
    for (const _ of rigSteps(style, { coaches: 1 }, out)) {
      steps += 1;
      expect(out.rig).toBeUndefined();
    }
    expect(steps).toBeGreaterThanOrEqual(9);
    expect(out.rig?.coaches).toHaveLength(1);
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
