import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { DARK, LIGHT } from "@/components/brand/brand-colors";

// The guard that keeps the design system a system: every role exists in both
// faces, every text role reaches AA, and no component smuggles in a one-off.

const ROOT = join(__dirname, "..", "..");
const theme = readFileSync(join(ROOT, "src/styles/theme.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = theme.indexOf(selector);
  const open = theme.indexOf("{", start);
  const close = theme.indexOf("}", open);
  const body = theme.slice(open + 1, close);
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}
const light = block(':root,\n[data-theme="light"]');
const dark = block('[data-theme="dark"]');

const REQUIRED = [
  "surface-0", "surface-1", "surface-2", "surface-3", "surface-sunken", "surface-inverse",
  "ink-1", "ink-2", "ink-3", "ink-inverse", "accent", "accent-hover", "accent-ink", "accent-soft",
  "line", "line-strong", "line-highlight",
  "go-fg", "go-bg", "go-line", "watch-fg", "watch-bg", "watch-line", "stop-fg", "stop-bg", "stop-line", "neutral-fg", "neutral-bg", "neutral-line",
  "key-red", "key-orange", "key-yellow", "key-white", "key-cap", "key-cap-ink", "key-window", "key-led", "key-led-dim",
  "readout-bg", "readout-fg", "readout-ghost", "focus-ring", "backdrop", "skeleton-base", "skeleton-sheen",
  "selection-bg", "selection-fg", "scrollbar-thumb", "elevation-1", "elevation-2", "elevation-3", "key-shadow", "key-shadow-pressed",
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

describe("theme roles", () => {
  it("defines every role in both faces", () => {
    for (const name of REQUIRED) {
      expect(light[name], `light --${name}`).toBeDefined();
      expect(dark[name], `dark --${name}`).toBeDefined();
    }
  });

  it.each([["light", light], ["dark", dark]] as const)("%s face meets AA for text roles", (_face, t) => {
    for (const surface of ["surface-0", "surface-1", "surface-2", "surface-3"]) {
      for (const ink of ["ink-1", "ink-2", "ink-3"]) {
        expect(contrast(t[ink]!, t[surface]!), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const tone of ["go", "watch", "stop", "neutral"]) {
      expect(contrast(t[`${tone}-fg`]!, t[`${tone}-bg`]!), `${tone}-fg on ${tone}-bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t[`${tone}-fg`]!, t["surface-0"]!), `${tone}-fg on surface-0`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(t["accent-ink"]!, t["accent"]!), "accent-ink on accent").toBeGreaterThanOrEqual(4.5);
    expect(contrast(t["focus-ring"]!, t["surface-0"]!), "focus ring on surface-0").toBeGreaterThanOrEqual(3);
    expect(contrast(t["key-cap-ink"]!, t["key-cap"]!), "key legend on cap").toBeGreaterThanOrEqual(4.5);
    if (_face === "dark") {
      for (const key of ["key-red", "key-orange", "key-yellow", "key-white"]) {
        expect(contrast(t["key-cap-ink"]!, t[key]!), `legend on ${key}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(t["readout-fg"]!, t["readout-bg"]!), "readout").toBeGreaterThanOrEqual(4.5);
  });

  it("keeps brand-colors.ts in parity with the CSS", () => {
    expect(LIGHT.surface0).toBe(light["surface-0"]);
    expect(LIGHT.ink1).toBe(light["ink-1"]);
    expect(LIGHT.accent).toBe(light["accent"]);
    expect(DARK.surface0).toBe(dark["surface-0"]);
    expect(DARK.ink1).toBe(dark["ink-1"]);
    expect(DARK.accent).toBe(dark["accent"]);
    expect(DARK.keyRed).toBe(dark["key-red"]);
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}

// Files from the incumbent world awaiting rewrite in later phases. Shrinks to empty by Phase 5.
const LEGACY_ALLOWLIST = new Set<string>([]);
// ImageResponse drawings cannot read CSS variables; they import brand-colors and use literal neutrals.
const HEX_ALLOWLIST = new Set([
  "src/components/brand/brand-colors.ts",
  "src/styles/theme.css",
  "src/components/theme/theme-boot.ts",
  "src/app/opengraph-image.tsx",
  "src/app/apple-icon.tsx",
]);
const SPACING_STEPS = new Set(["0", "0.5", "1", "1.5", "2", "3", "4", "6", "8", "12", "16", "24"]);

describe("component discipline", () => {
  const files = walk(join(ROOT, "src")).map((p) => relative(ROOT, p)).filter((p) => !LEGACY_ALLOWLIST.has(p));

  it("uses no arbitrary size, radius, shadow, tracking, or z-index classes", () => {
    const banned = /\b(text|rounded|tracking|shadow|duration|z|leading)-\[/;
    const offenders = files.filter((f) => f.endsWith(".tsx") && banned.test(readFileSync(join(ROOT, f), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("uses no v3 arbitrary-var syntax", () => {
    const offenders = files.filter((f) => f.endsWith(".tsx") && /\[var\(--/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("keeps raw hex colours out of components", () => {
    const offenders = files.filter((f) => !HEX_ALLOWLIST.has(f) && /\.(tsx?)$/.test(f) && /#[0-9a-fA-F]{6}\b/.test(readFileSync(join(ROOT, f), "utf8")));
    expect(offenders).toEqual([]);
  });

  it("keeps spacing on the rhythm", () => {
    const re = /\b(?:-?(?:m|mx|my|mt|mb|ml|mr|p|px|py|pt|pb|pl|pr|gap|gap-x|gap-y|space-x|space-y|inset|top|bottom|left|right))-(\d+(?:\.\d+)?)\b/g;
    const offenders: string[] = [];
    for (const f of files.filter((p) => p.endsWith(".tsx"))) {
      const src = readFileSync(join(ROOT, f), "utf8");
      for (const m of src.matchAll(re)) if (!SPACING_STEPS.has(m[1]!)) offenders.push(`${f}: ${m[0]}`);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("keeps every source and test file under 500 lines", () => {
    const all = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "tests"))];
    const long = all.filter((p) => readFileSync(p, "utf8").split("\n").length > 500).map((p) => relative(ROOT, p));
    expect(long).toEqual([]);
  });
});
