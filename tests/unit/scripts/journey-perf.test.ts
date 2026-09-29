import { afterEach, describe, expect, it, vi } from "vitest";
import { SETTLE_MS, attribute, drawingSettled, frameStats, longest, softwareFailures } from "../../../scripts/journey-perf.mjs";

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

describe("softwareFailures: what a software GPU's run can fail on (J6-3)", () => {
  const clean = { rate: 4, foreign: [], cls: 0.002, why: "", q: null, heaviest: false, settled: true } as const;

  it("passes a run that asked no other host, held its layout and decided its drawing; frame times are not its business", () => {
    expect(softwareFailures(clean)).toEqual([]);
  });

  it("fails another host asked, CLS over 0.05, or a drawing that never decided", () => {
    expect(softwareFailures({ ...clean, foreign: ["https://example.invalid"] })).toEqual(["asked https://example.invalid"]);
    expect(softwareFailures({ ...clean, cls: 0.06 })).toEqual(["CLS 0.060 over 0.05"]);
    expect(softwareFailures({ ...clean, why: null })).toEqual(["the drawing never decided"]);
  });

  it("at the heaviest rate, asks the governor to have answered: a quality step stored, or the still for quality or load", () => {
    expect(softwareFailures({ ...clean, heaviest: true })).toEqual(["the governor never answered: no quality step stored, and no still for quality or load"]);
    expect(softwareFailures({ ...clean, heaviest: true, q: "1" })).toEqual([]);
    expect(softwareFailures({ ...clean, heaviest: true, why: "quality" })).toEqual([]);
    expect(softwareFailures({ ...clean, heaviest: true, why: "load" })).toEqual([]);
    expect(softwareFailures({ ...clean, heaviest: true, why: "place" })).toHaveLength(1);
  });

  // The nightly's 10× run on a GPU-less runner (run 36406365173): the drawing decided live, and the pin had not come when
  // the wait for it ended, so nothing was scrolled and the governor was fed no frame at all. It was never asked: the run
  // says what did not happen, and judges the governor only once the chapter has pinned.
  it("fails a drawing that decided live but neither pinned nor settled on the still in the wait as that, and never blames the governor for it", () => {
    const unsettled = `the drawing decided live but neither pinned nor settled on the still in ${SETTLE_MS / 1000} s`;
    expect(softwareFailures({ ...clean, heaviest: true, settled: false })).toEqual([unsettled]);
    expect(softwareFailures({ ...clean, settled: false })).toEqual([unsettled]);
    expect(softwareFailures({ ...clean, why: null, settled: false })).toEqual(["the drawing never decided"]);
  });
});

describe("drawingSettled: when a software run stops waiting for the drawing", () => {
  /** The page as the predicate reads it: whether #anatomy is pinned live, and <html data-drawing>. */
  const page = (pinned: boolean, drawing: string) =>
    vi.stubGlobal("document", {
      querySelector: (selector: string) => (selector === "#anatomy.is-live" && pinned ? {} : null),
      documentElement: { dataset: { drawing } },
    });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("once the drawing is live and pinned, or once it has settled on the still: never the whole wait for a pin that will not come", () => {
    page(true, "live");
    expect(drawingSettled()).toBe(true);
    page(false, "still");
    expect(drawingSettled()).toBe(true);
    page(false, "live"); // the scene still on its way
    expect(drawingSettled()).toBe(false);
  });
});
