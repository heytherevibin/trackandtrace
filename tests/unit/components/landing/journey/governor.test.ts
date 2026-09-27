import { describe, expect, it } from "vitest";
import { createGovernor, startLevel } from "@/components/landing/journey/governor";

function run(levels = 3, start = 0) {
  const sets: number[] = [];
  let floors = 0;
  let t = 1000;
  const g = createGovernor({ levels, start, set: (l) => sets.push(l), floor: () => (floors += 1) });
  const feed = (n: number, gap: number) => {
    for (let i = 0; i < n; i += 1) {
      t += gap;
      g.drew(t);
    }
  };
  return { g, sets, feed, floors: () => floors };
}

describe("the governor (spec §3.C; v3's governor.js)", () => {
  it("holds at the display's pace", () => {
    const { sets, feed, floors } = run();
    feed(400, 16);
    expect(sets).toEqual([]);
    expect(floors()).toBe(0);
  });

  it("steps down when a gesture's p90 runs over 26 ms, judging again only after 45 frames", () => {
    const { sets, feed } = run();
    feed(31, 30); // the first frame only starts the clock; 30 gaps later it judges
    expect(sets).toEqual([1]);
    feed(45, 30); // cooling down
    expect(sets).toEqual([1]);
    feed(1, 30);
    expect(sets).toEqual([1, 2]);
  });

  it("asks for the still drawing only when the lowest step still runs over 40 ms", () => {
    const { sets, feed, floors } = run(3, 2);
    feed(31, 30);
    expect(floors()).toBe(0);
    expect(sets).toEqual([]);
    feed(46, 45);
    expect(floors()).toBe(1);
  });

  it("never counts a pause between gestures, or a stall that is not the drawing's", () => {
    const { g, sets, feed } = run();
    feed(200, 200);
    g.drew(99_000);
    g.idle();
    g.drew(99_030);
    expect(sets).toEqual([]);
  });

  it("steps back up after 180 good judgements, at most twice", () => {
    const { sets, feed } = run(4, 3);
    feed(211, 16);
    expect(sets).toEqual([2]);
    feed(45 + 181, 16); // 45 frames' cool-down after the step up, then 181 good judgements
    expect(sets).toEqual([2, 1]);
    feed(1000, 16);
    expect(sets).toEqual([2, 1]);
  });

  it("starts from this session's step, or full quality", () => {
    expect(startLevel("2", 3)).toBe(2);
    for (const stored of [null, "still", "7", "-1", "1.5"]) expect(startLevel(stored, 3), String(stored)).toBe(0);
  });
});
