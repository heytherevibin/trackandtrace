import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startRun } from "@/components/landing/journey/run";
import { MODULES } from "@/components/landing/journey/start-journey";
import { testContext } from "./journey-context";

// run.ts on a laid-out stand-in (jsdom lays nothing out): three stations 300px wide, 500px apart, on a 1440×836 pin.
// Anime's scroll sync is the e2e's to prove (run.spec.ts); here it is a stand-in.
vi.mock("animejs", () => ({
  onScroll: () => ({ revert: () => undefined, refresh: () => undefined, reverted: false, target: null }),
  animate: () => ({ revert: () => undefined }),
}));

const MARKUP = `<header></header><div id="run" class="run"><div class="run-pin"><div class="run-window" aria-hidden="true"><svg class="run-far"></svg><svg class="run-line"></svg><svg class="run-near"></svg></div><span class="run-train" aria-hidden="true"><span></span></span><div class="run-track"><section id="features"><div class="run-intro" data-station=""></div><article data-station=""></article></section><section id="use"><div data-station=""></div></section></div></div></div>`;

function lay(runTop: number, pinHeight = 836): HTMLElement {
  const run = document.getElementById("run")!;
  run.getBoundingClientRect = () => ({ top: runTop, bottom: runTop + 900, left: 0, right: 1440, width: 1440, height: 900 }) as DOMRect;
  const pin = run.querySelector<HTMLElement>(".run-pin")!;
  Object.defineProperty(pin, "clientHeight", { configurable: true, value: pinHeight });
  Object.defineProperty(pin, "clientWidth", { configurable: true, value: 1440 });
  run.querySelector<HTMLElement>(".run-track")!.getBoundingClientRect = () => ({ left: 0 }) as DOMRect;
  run.querySelectorAll<HTMLElement>("[data-station]").forEach((s, i) => {
    Object.defineProperty(s, "offsetHeight", { configurable: true, value: 300 });
    s.getBoundingClientRect = () => ({ left: i * 500, right: i * 500 + 300, top: 0, bottom: 300 }) as DOMRect;
  });
  return run;
}

beforeEach(() => {
  document.body.innerHTML = MARKUP;
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("the window-seat run (J6-7, J6-8)", () => {
  it("leaves 06 and 07 as the server drew them with Motion off", () => {
    const run = lay(200);
    const stop = startRun(testContext({ motion: false }));
    expect(run.classList.contains("is-running")).toBe(false);
    stop();
  });

  it("pins when the reader is above it and every station fits: its height, the window's lines, where each section stands", () => {
    const run = lay(200);
    const stop = startRun(testContext());
    expect(run.classList.contains("is-running")).toBe(true);
    // centres 150, 650, 1150: the travel is 1000, and the pin plus the travel is the run's height
    expect(run.style.getPropertyValue("--run-h")).toBe("1836px");
    expect(run.querySelector(".run-line .run-stop")).not.toBeNull();
    expect(run.querySelectorAll(".run-line .run-km").length).toBeGreaterThan(0);
    // the page y each section's top would have: the run's start plus its first station's anchor (no masthead here)
    expect(document.getElementById("features")?.dataset.runAt).toBe("200");
    expect(document.getElementById("use")?.dataset.runAt).toBe("1200");
    expect(document.getElementById("use")?.getAttribute("tabindex")).toBe("-1");
    expect(document.querySelector("[data-station].is-here")).toBe(document.querySelector(".run-intro"));
    stop();
  });

  it("waits while the reader is below it, and pins once they are back above it (J3's rule)", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame"] });
    const run = lay(-500);
    const stop = startRun(testContext());
    expect(run.classList.contains("is-running")).toBe(false);
    lay(100);
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersToNextFrame();
    expect(run.classList.contains("is-running")).toBe(true);
    stop();
  });

  it("never pins a window too short for its stations", () => {
    const run = lay(200, 400); // 400 - 96 - 20 leaves 284px for 300px stations
    const stop = startRun(testContext());
    expect(run.classList.contains("is-running")).toBe(false);
    expect(run.style.getPropertyValue("--run-band")).toBe("");
    stop();
  });

  it("brings 07's first station to the window from a link to it, says so in the address, and focuses 07 in place", () => {
    lay(200);
    const push = vi.spyOn(window.history, "pushState");
    const stop = startRun(testContext());
    const link = document.createElement("a");
    link.href = "#use";
    document.body.append(link);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(push).toHaveBeenCalledWith(null, "", "#use");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 1200 });
    expect(document.activeElement?.id).toBe("use");
    stop();
  });

  it("is started last, so a rebuild tears it down first: its unpin is measured on the page the reader sees, before the still's and the drawing's teardowns change the layout above it for a moment", () => {
    expect(MODULES.at(-1)).toBe(startRun);
  });

  it("puts everything back on teardown", () => {
    const run = lay(200);
    const stop = startRun(testContext());
    stop();
    expect(run.classList.contains("is-running")).toBe(false);
    expect(run.getAttribute("style") ?? "").toBe("");
    expect(run.querySelector(".run-line")?.childNodes.length).toBe(0);
    expect(run.querySelector(".run-line")?.hasAttribute("viewBox")).toBe(false);
    expect(document.querySelectorAll("[data-run-at], [tabindex], .is-here, .is-passed, .run-snap")).toHaveLength(0);
  });
});
