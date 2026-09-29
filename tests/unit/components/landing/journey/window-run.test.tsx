import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Features } from "@/components/landing/features";
import { WindowRun } from "@/components/landing/journey/window-run";
import { PhotoSplit } from "@/components/landing/photo-split";

// 06–07's frame (spec §3.A, §3.B; J6-6): the server draws it, the journey (run.ts) moves it.

function page() {
  return render(
    <WindowRun>
      <Features />
      <PhotoSplit />
    </WindowRun>,
  ).container;
}

describe("the window-seat run's frame", () => {
  it("wraps 06 and 07 on its track, with a window of three layers and a train, both hidden from assistive tech", () => {
    const run = page().querySelector("#run.run")!;
    const window_ = run.querySelector(".run-pin > .run-window")!;
    expect(window_).toHaveAttribute("aria-hidden", "true");
    expect([...window_.querySelectorAll("svg")].map((s) => s.getAttribute("class"))).toEqual(["run-far", "run-line", "run-near"]);
    expect(run.querySelector(".run-pin > .run-train")).toHaveAttribute("aria-hidden", "true");
    expect(run.querySelector(".run-train svg")).not.toBeNull();
    expect([...run.querySelectorAll(".run-pin > .run-track > section")].map((s) => s.id)).toEqual(["features", "use"]);
  });

  it("marks six stations in reading order: 06's heading, its three plates, 07's words and its figure", () => {
    const container = page();
    const stations = [...container.querySelectorAll<HTMLElement>("[data-station]")];
    expect(stations.map((s) => `${s.tagName.toLowerCase()}${s.classList.contains("run-intro") ? ".run-intro" : ""}`)).toEqual(["div.run-intro", "article", "article", "article", "div", "figure"]);
    expect(container.querySelector(".run-intro [data-flap]")).toHaveTextContent("06 · More than a check");
    expect(container.querySelector("#features > .run-cards")).not.toBeNull();
    // the links keep their reading order: the three plates' own
    expect([...container.querySelectorAll("#run a")].map((a) => a.textContent)).toEqual(["Open Watchlist →", "Open Pre-booking →", "Open Accuracy →"]);
  });
});
