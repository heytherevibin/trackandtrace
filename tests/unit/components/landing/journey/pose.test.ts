import { describe, expect, it } from "vitest";
import { STILL_ANATOMY, anatomyPhases, anatomyPose, terminusPose, type Pose } from "@/components/landing/journey/pose";

const distance = (p: Pose): number => Math.hypot(p.pos[0] - p.target[0], p.pos[1] - p.target[1], p.pos[2] - p.target[2]);

describe("anatomyPhases", () => {
  it("comes apart between 0.12 and 0.32, and back together between 0.5 and 0.6", () => {
    expect(anatomyPhases(0.12).explode).toBe(0);
    expect(anatomyPhases(0.32).explode).toBe(1);
    expect(anatomyPhases(0.45).explode).toBe(1);
    expect(anatomyPhases(0.6).explode).toBe(0);
  });

  it("shows the callouts only while the parts are apart", () => {
    expect(anatomyPhases(0.25).callouts).toBe(0);
    expect(anatomyPhases(0.4).callouts).toBe(1);
    expect(anatomyPhases(0.54).callouts).toBe(0);
  });

  it("couples, raises the pantograph and drives away in that order", () => {
    const at = anatomyPhases(0.86);
    expect(at.couple).toBe(1);
    expect(at.panto).toBeGreaterThan(0);
    expect(at.panto).toBeLessThan(1);
    expect(at.drive).toBe(0);
    expect(anatomyPhases(1).drive).toBe(1);
  });
});

describe("the still frame", () => {
  it("is fully apart with its callouts shown, before the side view", () => {
    expect(anatomyPose(STILL_ANATOMY, 2)).toMatchObject({ scan: 1, explode: 1, callouts: 1, side: 0, dims: 0, couple: 0, panto: 0, drive: 0, lineside: false });
  });

  it("frames wide screens at 30° and phones at 46°", () => {
    expect(anatomyPose(STILL_ANATOMY, 2).fov).toBe(30);
    expect(anatomyPose(STILL_ANATOMY, 0.75).fov).toBe(46);
  });

  it("stands back far enough for the exploded height, in front of the train", () => {
    for (const aspect of [2, 0.75]) {
      const pose = anatomyPose(STILL_ANATOMY, aspect);
      const half = Math.tan((pose.fov * Math.PI) / 360);
      const spanH = aspect < 1 ? 12 : 17;
      expect(distance(pose)).toBeGreaterThanOrEqual((spanH / 2 / half) * 1.08 - 1e-9);
      expect(pose.pos[2]).toBeGreaterThan(0);
    }
  });

  it("is a pure function of progress and shape", () => {
    expect(anatomyPose(0.4, 1.6)).toEqual(anatomyPose(0.4, 1.6));
  });
});

describe("terminusPose", () => {
  it("has arrived by 85% of its progress", () => {
    expect(terminusPose(0, 2).drive).toBe(-150);
    expect(terminusPose(0.85, 2).drive).toBeCloseTo(0, 10);
    expect(terminusPose(1, 2).drive).toBeCloseTo(0, 10);
  });

  it("shows the whole train coupled, with the pantograph up", () => {
    expect(terminusPose(1, 2)).toMatchObject({ scan: 1, explode: 0, callouts: 0, dims: 0, couple: 1, panto: 1, lineside: false });
  });

  it("stands 46 m off on wide screens at 26°, and 60 m off on phones at 44°", () => {
    const wide = terminusPose(1, 2);
    expect(wide.fov).toBe(26);
    expect(wide.target).toEqual([-18, 2.2, 0]);
    expect(distance(wide)).toBeCloseTo(46, 9);
    const tall = terminusPose(1, 0.8);
    expect(tall.fov).toBe(44);
    expect(distance(tall)).toBeCloseTo(60, 9);
  });
});
