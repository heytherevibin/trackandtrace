import { describe, expect, it } from "vitest";
import { isDesignLockedAccent } from "../e2e/axe-exemption";

// The e2e axe scan exempts a colour-contrast node only when it sits on the locked steel fill (the
// primary button, the skip link, the toast's action). Steel text on a ground is never exempt, so
// small steel words can't slip back under AA unseen.

const node = (...data: readonly unknown[]) => ({ any: data.map((d) => ({ data: d })) });
const pair = (fgColor: string, bgColor: string) => node({ fgColor, bgColor });

describe("isDesignLockedAccent", () => {
  it.each([
    ["pale words on the steel fill by day", "#f2f2f3", "#5980a6"],
    ["dark words on the steel fill by night", "#1d2d3d", "#5980a6"],
    ["pale words on the fill's hover step", "#f2f2f3", "#597ea3"],
  ])("exempts %s", (_name, fg, bg) => {
    expect(isDesignLockedAccent(pair(fg, bg))).toBe(true);
  });

  it.each([
    ["steel text on the day ground", "#5980a6", "#f2f2f3"],
    ["steel text on the night ground", "#5980a6", "#1d2d3d"],
    ["the hover step as text", "#597ea3", "#f2f2f3"],
    ["an unrelated pair", "#777777", "#ffffff"],
  ])("does not exempt %s", (_name, fg, bg) => {
    expect(isDesignLockedAccent(pair(fg, bg))).toBe(false);
  });

  it("ignores checks without colour data", () => {
    expect(isDesignLockedAccent(node(null, undefined, "#5980a6", {}))).toBe(false);
  });
});
