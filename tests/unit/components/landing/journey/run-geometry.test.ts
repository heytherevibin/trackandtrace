import { describe, expect, it } from "vitest";
import { PARALLAX, anchorOf, band, fitsRun, hereAt, kmAt, layers, leanStep, mast, offsets, runLayout, trainAt } from "@/components/landing/journey/geometry/run";

// The window-seat run's geometry (spec §3.A; prototype v3's run.js), pure.

const KM = { from: 530, to: 644 };
// three stations on the track: 06's heading, a card, 07's figure
const L = runLayout(
  [
    { x0: 0, x1: 300 },
    { x0: 400, x1: 700 },
    { x0: 800, x1: 1400 },
  ],
  { w: 1440, h: 836, trainX: trainAt(1440, false) },
);

describe("the run's window", () => {
  it("keeps a line diagram along its foot, lower on short windows", () => {
    expect(band(639)).toBe(96);
    expect(band(640)).toBe(124);
  });

  it("runs only while the tallest station stands above the line diagram, on a window wide enough to read", () => {
    expect(fitsRun([400, 692], 836, 1440)).toBe(true); // 836 - 124 - 20 = 692
    expect(fitsRun([400, 693], 836, 1440)).toBe(false);
    expect(fitsRun([100], 836, 299)).toBe(false);
    expect(fitsRun([], 836, 1440)).toBe(false);
  });

  it("holds the train a third in on a wide window, in the middle on a phone", () => {
    expect(trainAt(1440, false)).toBe(432);
    expect(trainAt(390, true)).toBe(195);
  });

  it("measures the stations' centres, and the travel that brings the last to the window", () => {
    expect(L.centers).toEqual([150, 550, 1100]);
    expect(L.halves).toEqual([150, 150, 300]);
    expect(L.first).toBe(150);
    expect(L.travel).toBe(950);
  });

  it("puts a station at the window by its distance from the first, within the travel", () => {
    expect(anchorOf(550, L.first, L.travel)).toBe(400);
    expect(anchorOf(100, L.first, L.travel)).toBe(0);
    expect(anchorOf(5000, L.first, L.travel)).toBe(950);
  });

  it("names the station at the window: the last whose near edge, less 24px, has reached it", () => {
    expect(hereAt(L.first, L.centers, L.halves)).toBe(0);
    expect(hereAt(550 - 150 - 25, L.centers, L.halves)).toBe(0);
    expect(hereAt(550 - 150 - 24, L.centers, L.halves)).toBe(1);
    expect(hereAt(L.first + L.travel, L.centers, L.halves)).toBe(2);
  });

  it("brings the first station to the train at 0 and the last at 1; the far masts pass slower, the near posts faster", () => {
    expect(L.centers[0]! + offsets(0, L).track).toBe(L.trainX);
    expect(L.centers[2]! + offsets(1, L).track).toBe(L.trainX);
    const moved = (k: "track" | "far" | "near") => offsets(0, L)[k] - offsets(1, L)[k];
    expect(moved("far")).toBeCloseTo(L.travel * PARALLAX.far, 6);
    expect(moved("track")).toBe(L.travel);
    expect(moved("near")).toBeCloseTo(L.travel * PARALLAX.near, 6);
  });

  it("leans the train into its pace, a quarter of the way each frame, never past 9°", () => {
    expect(leanStep(0, 0.01, 1000)).toBeCloseTo(-0.75, 6); // 10px forward: a lean of −3°, reached a quarter at a time
    expect(leanStep(0, 1, 1000)).toBeCloseTo(-2.25, 6); // a fling: −9° at most
    expect(leanStep(-4, 0, 1000)).toBeCloseTo(-3, 6); // at rest it rights itself
  });

  it("counts kilometre posts on from 06's to 07's", () => {
    expect(kmAt(L.first, L.first, L.travel, KM)).toBe(530);
    expect(kmAt(L.first + L.travel, L.first, L.travel, KM)).toBe(644);
  });

  it("draws a lattice mast as its two legs and its braces", () => {
    expect(mast(10, 100, 60, 7)).toBe("M10 100V60M17 100V60M10 100L17 88M17 88L10 76M10 76L17 64");
  });
});

describe("the window's three layers", () => {
  const drawn = layers(L, KM);

  it("spans each layer as far as it travels", () => {
    expect(drawn.far.span).toBe(Math.ceil(1440 + 950 * PARALLAX.far + 40));
    expect(drawn.line.span).toBe(1440 + 950 + 40);
    expect(drawn.near.span).toBe(Math.ceil(1440 + 950 * PARALLAX.near + 40));
  });

  it("draws a platform and a tick for every station", () => {
    expect(drawn.line.stops).toHaveLength(3);
    const rail = 836 - 46;
    expect(drawn.line.stops[2]).toEqual({ platform: `M800.0 ${rail - 30}H1400.0M800.0 ${rail - 30}V${rail - 24}M1400.0 ${rail - 30}V${rail - 24}`, tick: `M1100.0 ${rail - 40}V${rail + 12}` });
  });

  it("labels every other kilometre post below the rails, counting from the track's own x", () => {
    const rail = 836 - 46;
    expect(drawn.line.posts[0]).toEqual({ x: 64, y: rail + 24, km: kmAt(60, L.first, L.travel, KM) });
    expect(drawn.line.posts.every((p, i, all) => i === 0 || p.x - all[i - 1]!.x === 320)).toBe(true);
  });

  it("strokes each layer with its own weight class", () => {
    expect(drawn.far.strokes.map((s) => s.cls)).toEqual(["run-stroke is-far"]);
    expect(drawn.line.strokes.map((s) => s.cls)).toEqual(["run-stroke is-faint", "run-stroke", "run-stroke is-mast"]);
    expect(drawn.near.strokes.map((s) => s.cls)).toEqual(["run-stroke is-near"]);
  });
});
