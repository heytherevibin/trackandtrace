import { describe, expect, it } from "vitest";
import { JOURNEY_CHUNK_MARK } from "@/components/landing/journey/journey-mark";
import { SCENE_CHUNK_MARK } from "@/components/landing/journey/scene/scene-mark";
import { BUDGETS, MARKS, measure } from "../../../scripts/journey-budgets.mjs";

const noise = (n: number) => Array.from({ length: n }, (_, i) => ((i * 2654435761) % 4294967296).toString(36)).join("");

/** A lazy loader as the bundler writes one: fetch these chunks together, then run a module. */
const loads = (...names: readonly string[]) => `e.v(t=>Promise.all([${names.map((n) => `"static/chunks/${n}"`).join(",")}].map(t=>e.l(t))).then(()=>t(1)))`;

describe("the journey's chunk budgets (spec §3.H; J5-15)", () => {
  it("finds the chunks by the same marks the app carries", () => {
    expect(MARKS.journey).toBe(JOURNEY_CHUNK_MARK);
    expect(MARKS.scene).toBe(SCENE_CHUNK_MARK);
    expect(BUDGETS).toEqual({ journey: 70 * 1024, scene: 240 * 1024 });
  });

  it("passes a journey chunk and a scene within budget, three.js only in the scene", () => {
    const r = measure([
      { name: "a.js", text: `${MARKS.journey} ${noise(2000)}` },
      { name: "b.js", text: `${MARKS.scene} ${noise(4000)}` },
      { name: "c.js", text: `${MARKS.three} ${noise(4000)}` },
      { name: "d.js", text: "the app" },
    ]);
    expect(r.failures).toEqual([]);
    expect(r.sceneBytes).toBeGreaterThan(r.journeyBytes);
  });

  it("fails three.js in the journey chunk, a missing chunk, or a chunk over budget", () => {
    expect(measure([{ name: "a.js", text: `${MARKS.journey} ${MARKS.three}` }]).failures.join(" ")).toMatch(/three\.js is in the journey chunk.*no chunk carries the scene/);
    expect(measure([{ name: "b.js", text: MARKS.scene }]).failures.join(" ")).toMatch(/no chunk carries the journey/);
    expect(measure([{ name: "a.js", text: `${MARKS.journey} ${noise(200_000)}` }, { name: "b.js", text: MARKS.scene }]).failures.join(" ")).toMatch(/journey chunk .* over its 70 KB/);
  });
});

describe("the chunks each budget counts (Task 7's split: the journey loads as several chunks)", () => {
  const page = { name: "static/chunks/page.js", text: `the app ${loads("loaders.js", "anime.js", "journey.js")}` };
  const journey = { name: "static/chunks/journey.js", text: `${MARKS.journey} ${noise(2000)}` };
  const anime = { name: "static/chunks/anime.js", text: `animejs ${noise(2000)}` };
  const loaders = { name: "static/chunks/loaders.js", text: `${loads("hud.js")} ${loads("scene.js", "three.js")}` };
  const scene = { name: "static/chunks/scene.js", text: `${MARKS.scene} ${noise(2000)}` };
  const three = { name: "static/chunks/three.js", text: `${MARKS.three} ${noise(4000)}` };
  const hud = { name: "static/chunks/hud.js", text: `${MARKS.hud} ${noise(4000)}` };

  it("counts against 70 KB every chunk fetched with the journey chunk, and against 240 KB every chunk the scene's loader fetches; never the frame meter", () => {
    const r = measure([page, journey, anime, loaders, scene, three, hud], { requireLoader: true });
    expect(r.failures).toEqual([]);
    expect(r.journey).toEqual(["static/chunks/loaders.js", "static/chunks/anime.js", "static/chunks/journey.js"]);
    expect(r.scene).toEqual(["static/chunks/scene.js", "static/chunks/three.js"]);
    const alone = measure([page, journey, loaders, scene, three, hud]);
    expect(r.journeyBytes).toBeGreaterThan(alone.journeyBytes); // anime.js is counted, not only the marked chunk
  });

  it("counts a chunk the journey and the scene share once, where it is loaded: with the journey", () => {
    const shared = { name: "static/chunks/shared.js", text: noise(2000) };
    const r = measure([
      { ...page, text: `the app ${loads("loaders.js", "shared.js", "journey.js")}` },
      journey,
      shared,
      { ...loaders, text: `${loads("hud.js")} ${loads("shared.js", "scene.js")}` },
      scene,
      hud,
    ]);
    expect(r.failures).toEqual([]);
    expect(r.journey).toContain("static/chunks/shared.js");
    expect(r.scene).toEqual(["static/chunks/scene.js"]);
  });

  it("fails a chunk the journey loads that it cannot place: neither the scene nor the frame meter", () => {
    const r = measure([page, journey, anime, { ...loaders, text: `${loads("hud.js")} ${loads("scene.js")} ${loads("new.js")}` }, scene, hud, { name: "static/chunks/new.js", text: noise(100) }]);
    expect(r.failures.join(" ")).toMatch(/the journey loads static\/chunks\/new\.js, which no budget can place/);
  });

  it("fails a loader that names a chunk the build does not have", () => {
    const r = measure([{ ...page, text: `the app ${loads("gone.js", "journey.js")}` }, journey, scene]);
    expect(r.failures.join(" ")).toMatch(/gone\.js is loaded but not in the build/);
  });

  it("with requireLoader, fails when no loader fetches the journey chunk: a split it cannot see would be under-counted", () => {
    expect(measure([journey, scene], { requireLoader: true }).failures.join(" ")).toMatch(/no loader fetches the journey chunk/);
    expect(measure([journey, scene]).failures).toEqual([]);
  });
});
