import { describe, expect, it } from "vitest";
import { BAYS, berthNumber, berthSeat, coachPlan } from "@/components/landing/journey/geometry/berths";

describe("a 3A coach's berths", () => {
  it("reads a berth's number from its label", () => {
    expect(berthNumber("12 LB")).toBe(12);
    expect(berthNumber("SL")).toBeNull();
  });

  it("finds a berth's bay and place: two stacks of three, then the side pair", () => {
    expect(berthSeat(1)).toEqual({ bay: 0, place: "stack", stack: 0 });
    expect(berthSeat(12)).toEqual({ bay: 1, place: "stack", stack: 1 });
    expect(berthSeat(15)).toEqual({ bay: 1, place: "side", stack: 0 });
    expect(berthSeat(0)).toBeNull();
    expect(berthSeat(BAYS * 8 + 1)).toBeNull();
  });

  it("draws nine bays, numbered as the coach is, lighting only the given berth's stack", () => {
    const plan = coachPlan(berthSeat(12));
    expect(plan.bays).toHaveLength(9);
    expect(plan.bays[1]!.stacks.map((s) => s.label)).toEqual(["9·10·11", "12·13·14"]);
    expect(plan.bays[1]!.side.label).toBe("15·16");
    expect(plan.bays.flatMap((b) => [...b.stacks, b.side]).filter((part) => part.lit)).toHaveLength(1);
    expect(plan.bays[1]!.stacks[1]!.lit).toBe(true);
    expect(plan.tagX).toBeCloseTo(plan.bays[1]!.stacks[1]!.x + 11);
    expect(coachPlan(null).tagX).toBeNull();
  });
});
