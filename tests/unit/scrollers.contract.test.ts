import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// A box that scrolls sideways must also be POSITIONED.
//
// `overflow-x: auto` clips what is in the box's flow. It does not clip an absolutely positioned
// descendant unless the box is that descendant's containing block, and `sr-only` — every visually
// hidden caption and column heading — is absolutely positioned. So a table wider than its unpositioned
// scroller leaves its hidden "Actions" heading out past the window's edge, and the PAGE scrolls
// sideways by exactly as much as the table overflows.
//
// Found 2026-10-04 on the Leads table, then measured for the shared DataTable in Chromium and
// WebKit: 552px of sideways page scroll with the scroller unpositioned, none with `relative`. It
// had gone unseen since the audit log shipped because the one test that looked for it read
// `window.scrollX` in the same tick as a smooth `scrollTo`, and so always read 0
// (tests/e2e/layout.ts, `sidewaysScroll`).
//
// jsdom has no layout, so this cannot be measured here. What can be held here is the rule: the
// class that makes a scroller and the class that positions it are written together.

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");
const SCROLLS = /\boverflow-x-(?:auto|scroll)\b/;
const POSITIONED = /(?<![\w:-])(?:relative|absolute|fixed|sticky)(?![\w-])/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return name.endsWith(".tsx") ? [path] : [];
  });
}

/** A line that is prose about a scroller, not one: inside a `//` or a block comment. */
const isComment = (line: string): boolean => /^\s*(?:\/\/|\/?\*|\{\/\*)/.test(line);

describe("sideways scrollers", () => {
  it("are positioned, so what they hold off-screen for a screen reader cannot scroll the page", () => {
    const offenders = files(SRC).flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .flatMap((line, i) => (SCROLLS.test(line) && !isComment(line) && !POSITIONED.test(line) ? [`${relative(ROOT, path)}:${i + 1}`] : [])),
    );
    expect(offenders, `each of these scrolls sideways without being positioned:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("recognises a scroller and its position where they are written, and not a comment about one", () => {
    expect(SCROLLS.test('<div className="overflow-x-auto">')).toBe(true);
    expect(POSITIONED.test('<div className="overflow-x-auto">')).toBe(false);
    expect(POSITIONED.test('<div className="relative overflow-x-auto max-sm:hidden">')).toBe(true);
    // A variant is not the base class: `sm:relative` leaves the scroller unpositioned below `sm`.
    expect(POSITIONED.test('<div className="overflow-x-auto sm:relative">')).toBe(false);
    expect(isComment("    // the table scrolls sideways (DataTable's own `overflow-x-auto`)")).toBe(true);
    expect(isComment('      <div className="overflow-x-auto">')).toBe(false);
  });
});
