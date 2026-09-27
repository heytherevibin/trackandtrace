import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// motion.css states the reduced-motion rules twice: under the device's setting (the media query), and under the
// footer's Motion switch (html[data-motion="off"]). Plain CSS cannot share one rule body between a media query and
// an attribute selector, so this holds the two copies to each other instead of a comment.

const ROOT = join(__dirname, "..", "..", "..");
const OFF = 'html[data-motion="off"]';
const css = readFileSync(join(ROOT, "src/styles/motion.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

interface Rule {
  readonly selectors: readonly string[];
  readonly declarations: readonly string[];
}

/** Flat rules in a stretch of CSS, whitespace normalised. Selectors split on commas outside parentheses. */
function rules(text: string): Rule[] {
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors = "", body = ""]) => ({
    selectors: selectors.split(/,(?![^(]*\))/).map((s) => s.trim().replace(/\s+/g, " ")),
    declarations: body
      .split(";")
      .map((d) => d.trim().replace(/\s+/g, " "))
      .filter(Boolean),
  }));
}

/** The device's reduced-motion block: its body, and where it ends. */
function reducedBlock(): { readonly body: string; readonly end: number } {
  const open = css.indexOf("{", css.indexOf("@media (prefers-reduced-motion: reduce)"));
  for (let i = open + 1, depth = 1; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return { body: css.slice(open + 1, i), end: i + 1 };
  }
  throw new Error("motion.css: the reduced-motion block never closes");
}

describe("motion.css", () => {
  const reduced = reducedBlock();
  const device = rules(reduced.body);
  const switched = rules(css.slice(reduced.end)).filter((rule) => rule.selectors.every((s) => s.startsWith(OFF)));

  it("states the Motion-off rules exactly as the reduced-motion rules, rule for rule", () => {
    // The bare html[data-motion="off"] selector has no twin: under the media query, `*` already matches <html>.
    const unprefixed = switched.map((rule) => ({ selectors: rule.selectors.map((s) => s.slice(OFF.length).trim()).filter(Boolean), declarations: rule.declarations }));
    expect(device.length).toBeGreaterThan(0);
    expect(unprefixed).toEqual(device);
  });

  it("stops a held button under both, over the press rule's specificity", () => {
    const stop = (list: readonly Rule[]) => list.find((rule) => rule.selectors.some((s) => s.endsWith(":active")))?.declarations;
    expect(stop(device)).toContain("transform: none !important");
    expect(stop(switched)).toContain("transform: none !important");
  });
});
