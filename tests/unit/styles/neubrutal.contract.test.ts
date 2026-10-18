import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NEUBRUTAL_DARK, NEUBRUTAL_LIGHT } from "@/components/brand/brand-colors";

// The Neubrutal face (Claude Design "Trakline Industry — Neubrutal v4", handoff/tokens.css TT-200) is the traveller
// site's: html[data-face="neubrutal"]. The console never carries the attribute and keeps Industry steel, so this face
// is held to its own pairings here, while tokens.contract.test.ts keeps holding steel to its own.

const ROOT = join(__dirname, "..", "..", "..");
const css = readFileSync(join(ROOT, "src/styles/neubrutal.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block for ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return Object.fromEntries([...css.slice(open + 1, close).matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}
const day = block(':root[data-face="neubrutal"]');
const night = block(':root[data-face="neubrutal"][data-theme="dark"]');

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const s = parseInt(h.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

// The v4 palette, exactly as handoff/tokens.css sets it.
const DRAWN = {
  day: { bg: "#fff8e7", paper: "#ffffff", "ink-1": "#111111", "ink-2": "#2b2b2b", "ink-3": "#4f4f4f", edge: "#111111", shadow: "#111111", accent: "#ffd93d", pink: "#ff8fcf", lime: "#a3e635", blue: "#1e40ff", link: "#1a36d6", red: "#d6233a", orange: "#ff8c42", "on-fill": "#111111", "on-red": "#ffffff" },
  night: { bg: "#0e0e0f", paper: "#1a1a1c", "ink-1": "#f4f4f4", "ink-2": "#dadada", "ink-3": "#bebebe", edge: "#e9e9e9", shadow: "#e9e9e9", accent: "#ffd93d", pink: "#ff8fcf", lime: "#a3e635", blue: "#3b5bff", link: "#9dbdff", red: "#ff6b6b", orange: "#ff8c42", "on-fill": "#111111", "on-red": "#111111" },
} as const;

// The steel role names every component already speaks, so the whole site changes face at once.
const ROLES = [
  "surface-0", "surface-1", "surface-2", "surface-3",
  "ink-1", "ink-2", "ink-3", "ink-inverse", "ink-alert",
  "accent", "accent-text", "accent-strong", "accent-strong-hover", "accent-strong-active", "accent-ink", "accent-soft", "accent-soft-ink", "accent-wash", "accent-busy",
  "open-soft", "open-soft-ink", "queued-soft", "queued-soft-ink", "closed-soft", "closed-soft-ink",
  "line", "line-strong", "mark",
  "focus-ring", "backdrop", "skeleton-base", "skeleton-sheen", "selection-bg", "selection-fg", "scrollbar-thumb",
  "elevation-1", "elevation-2", "elevation-3",
] as const;

describe.each([["day", day, DRAWN.day], ["night", night, DRAWN.night]] as const)("Neubrutal %s face", (_face, t, drawn) => {
  it("carries the v4 palette exactly as drawn", () => {
    for (const [name, value] of Object.entries(drawn)) expect(t[name], `--${name}`).toBe(value);
  });

  it("maps every steel role", () => {
    for (const name of ROLES) expect(t[name], `--${name}`).toBeDefined();
  });

  it("keeps every text ink at AA on the page and on paper", () => {
    for (const ground of ["bg", "paper"]) {
      for (const ink of ["ink-1", "ink-2", "ink-3", "link", "red"]) {
        expect(contrast(t[ink]!, t[ground]!), `${ink} on ${ground}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps words on every coloured fill at AA", () => {
    for (const fill of ["accent", "pink", "lime", "orange"]) {
      expect(contrast(t["on-fill"]!, t[fill]!), `on-fill on ${fill}`).toBeGreaterThanOrEqual(4.5);
    }
    // Red is the one fill whose words change by face: v4 prints white on it by day. By night v4 also drew white on
    // #ff6b6b, which is 2.78:1, so the night face prints ink instead (owner told in the batch 1 PR).
    expect(contrast(t["on-red"]!, t.red!), "on-red on red").toBeGreaterThanOrEqual(4.5);
    // A filled digit key prints white on blue.
    expect(contrast("#ffffff", t.blue!), "white on blue").toBeGreaterThanOrEqual(4.5);
    // The roles the primary button and the status chips are drawn from.
    expect(contrast(t["accent-ink"]!, t["accent-strong"]!), "accent-ink on accent-strong").toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["accent-ink"]!, t["accent-strong-hover"]!), "accent-ink on accent-strong-hover").toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["accent-soft-ink"]!, t["accent-soft"]!), "accent-soft-ink on accent-soft").toBeGreaterThanOrEqual(4.5);
    for (const s of ["open", "queued", "closed"]) {
      expect(contrast(t[`${s}-soft-ink`]!, t[`${s}-soft`]!), `${s}-soft-ink on ${s}-soft`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(t["ink-inverse"]!, t["ink-alert"]!), "ink-inverse on ink-alert (danger)").toBeGreaterThanOrEqual(4.5);
  });

  it("draws edges and the focus ring at 3:1 against the page", () => {
    expect(contrast(t.edge!, t.bg!), "edge on bg").toBeGreaterThanOrEqual(3);
    expect(contrast(t["focus-ring"]!, t.bg!), "focus ring on bg").toBeGreaterThanOrEqual(3);
    expect(contrast(t["focus-ring"]!, t.paper!), "focus ring on paper").toBeGreaterThanOrEqual(3);
  });

  it("tells the three status fills apart", () => {
    expect(new Set(["open", "queued", "closed"].map((s) => t[`${s}-soft`])).size).toBe(3);
  });
});

describe("Neubrutal brand colours", () => {
  it("keep brand-colors.ts in parity with the CSS", () => {
    expect(NEUBRUTAL_LIGHT.bg).toBe(day.bg);
    expect(NEUBRUTAL_LIGHT.ink1).toBe(day["ink-1"]);
    expect(NEUBRUTAL_LIGHT.accent).toBe(day.accent);
    expect(NEUBRUTAL_DARK.bg).toBe(night.bg);
    expect(NEUBRUTAL_DARK.ink1).toBe(night["ink-1"]);
    expect(NEUBRUTAL_DARK.accent).toBe(night.accent);
  });
});

describe("Neubrutal token names", () => {
  // text-page is a type size; a --color-page beside it made Tailwind give text-page the page colour too, and every page
  // title on the traveller site went cream on cream. A colour must never share a name with a size.
  it("never gives a colour the name of a type size", () => {
    const tokens = readFileSync(join(ROOT, "src/styles/tokens.css"), "utf8");
    const names = (prefix: string) => new Set([...tokens.matchAll(new RegExp(`--${prefix}-([a-z0-9]+(?:-[a-z0-9]+)*):`, "g"))].map((m) => m[1]!).filter((n) => !n.endsWith("-line-height")));
    const sizes = names("text");
    const shared = [...names("color")].filter((n) => sizes.has(n));
    expect(shared).toEqual([]);
  });
});

describe("Neubrutal face scope", () => {
  it("is imported after the steel theme, so it wins wherever the attribute is set", () => {
    const globals = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
    expect(globals.indexOf('"../styles/neubrutal.css"')).toBeGreaterThan(globals.indexOf('"../styles/theme.css"'));
  });

  it("is worn by the traveller site's document and never by the console's", () => {
    const site = readFileSync(join(ROOT, "src/app/(site)/layout.tsx"), "utf8");
    const consoleLayout = readFileSync(join(ROOT, "src/app/console/layout.tsx"), "utf8");
    expect(site).toMatch(/data-face="neubrutal"/);
    expect(consoleLayout).not.toMatch(/data-face/);
  });
});
