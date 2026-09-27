import { describe, expect, it } from "vitest";
import { attribute, frameStats, longest } from "../../../scripts/journey-perf.mjs";

// The real-GPU budgets' arithmetic (spec §3.H), apart from the browser that feeds it: which long tasks are the
// journey's (§3.H budgets the longest *journey* task at load, not the page's hydration), which are the scene's steps,
// and the frame statistics.

const owners = { journey: new Set(["journey.js", "anime.js"]), scene: new Set(["scene.js"]) };
const url = (name: string) => `http://localhost:4210/_next/static/chunks/${name}`;

describe("attribute: whose long task is it", () => {
  it("names a task by the scripts that ran inside it: the scene's, else the journey's, else the page's", () => {
    const tasks = [
      { start: 100, duration: 96 },
      { start: 500, duration: 127 },
      { start: 700, duration: 72 },
      { start: 900, duration: 65 },
    ];
    const scripts = [
      { start: 101, duration: 95, url: url("framework.js") },
      { start: 501, duration: 120, url: url("anime.js") },
      { start: 700, duration: 20, url: url("anime.js") },
      { start: 721, duration: 50, url: url("scene.js") },
      { start: 902, duration: 60, url: url("scene.js") },
    ];
    expect(attribute(tasks, scripts, owners).map((t) => t.owner)).toEqual(["page", "journey", "scene", "scene"]);
  });

  it("ignores a script that ran outside the task, and reads a chunk's name without its query", () => {
    const tasks = [{ start: 100, duration: 60 }];
    expect(attribute(tasks, [{ start: 300, duration: 10, url: url("scene.js") }], owners)[0]?.owner).toBe("page");
    expect(attribute(tasks, [{ start: 110, duration: 10, url: `${url("journey.js")}?dpl=abc` }], owners)[0]?.owner).toBe("journey");
  });
});

describe("longest: the budget lines", () => {
  it("reports the page's, the journey's (scene steps included) and the scene's longest task", () => {
    const tasks = [
      { start: 0, duration: 96, owner: "page" },
      { start: 1, duration: 127, owner: "journey" },
      { start: 2, duration: 72, owner: "scene" },
    ] as const;
    expect(longest(tasks)).toEqual({ page: 127, journey: 127, scene: 72 });
    expect(longest([{ start: 0, duration: 140, owner: "page" }])).toEqual({ page: 140, journey: 0, scene: 0 });
  });
});

describe("frameStats", () => {
  it("gives p95, the median as frames per second, and the shares over 25 and 33 ms", () => {
    const frames = [...Array.from({ length: 98 }, () => 8), 30, 40];
    expect(frameStats(frames)).toEqual({ count: 100, p95: 8, medianFps: 125, over25: 2, over33: 1 });
  });

  it("is all zeros with no frames", () => {
    expect(frameStats([])).toEqual({ count: 0, p95: 0, medianFps: 0, over25: 0, over33: 0 });
  });
});
