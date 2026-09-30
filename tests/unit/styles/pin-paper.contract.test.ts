import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The paper under a pinned stage (journey-island.css; tests/e2e/journey/paper.spec.ts). What a browser test cannot
// show is pinned here as CSS: a phone's toolbar collapsing mid-pin grows the window from 100svh to 100lvh, and no
// Playwright browser collapses one (its svh and lvh are equal), so the sizing that covers that strip is read, not seen.

const ROOT = join(__dirname, "..", "..", "..");
const css = readFileSync(join(ROOT, "src/styles/journey-island.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of the first rule whose selector list includes `selector`. */
function declarations(selector: string): Record<string, string> {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1]!.split(",").map((s) => s.trim());
    if (!selectors.includes(selector)) continue;
    return Object.fromEntries(
      m[2]!
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()]),
    );
  }
  throw new Error(`no rule for ${selector}`);
}

describe("the paper under a pinned stage", () => {
  const paper = declarations('html[data-journey="on"] #anatomy.is-live > .pin-paper');

  it("reaches the large viewport's foot, so a collapsing toolbar opens onto paper", () => {
    // --paper-h is the pin's own height (small viewport); the sheet runs on by the toolbar's height (100lvh − 100svh).
    expect(paper["height"]).toBe("calc(var(--paper-h) + 100lvh - 100svh)");
  });

  it("still takes hold and lets go with its pin: its margin box is the pin's height", () => {
    expect(paper["margin-top"]).toBe("calc(-1 * var(--paper-h))");
    expect(paper["margin-bottom"]).toBe("calc(100svh - 100lvh)");
    expect(paper["position"]).toBe("sticky");
  });

  it("takes no pointer, and lies under the live drawing's canvas and the pin", () => {
    expect(paper["pointer-events"]).toBe("none");
    expect(paper["z-index"]).toBe("0");
  });

  it("is clipped by its section, so the overhang never shows past the stage or adds scroll", () => {
    for (const section of ['html[data-journey="on"] #anatomy.is-live', 'html[data-motion="on"][data-journey="on"] .chapters.is-pinned', 'html[data-journey="on"] #run.is-running']) {
      expect(declarations(`${section}:has(> .pin-paper)`)["overflow-y"], section).toBe("clip");
    }
  });

  it("cannot scroll the page sideways, whatever the hero does: the journey clips #main itself", () => {
    expect(declarations('html[data-journey="on"] #main')["overflow-x"]).toBe("clip");
  });
});
