import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PALETTE_TOKENS, cssRgb, mix, parseColor, readPalette, systemReader, type PaletteToken, type Rgb } from "@/components/landing/journey/scene/palette";

const byte = (c: Rgb) => [c.r, c.g, c.b].map((v) => Math.round(v * 255));

describe("parseColor", () => {
  it("reads the theme's token formats", () => {
    expect(byte(parseColor("#f2f2f3")!)).toEqual([242, 242, 243]);
    expect(byte(parseColor("  #FFF ")!)).toEqual([255, 255, 255]);
    expect(byte(parseColor("rgba(29, 31, 32, 0.16)")!)).toEqual([29, 31, 32]);
    expect(byte(parseColor("rgb(89 128 166 / 50%)")!)).toEqual([89, 128, 166]);
  });
  it("is nothing for anything else", () => {
    for (const raw of ["", "steel", "#12", "#1234567", "oklch(0.7 0.1 250)", "rgb(300, 0, 0)"]) expect(parseColor(raw), raw).toBeNull();
  });
});

describe("readPalette (J5-8)", () => {
  const day: Record<PaletteToken, string> = { "--surface-0": "#f2f2f3", "--ink-1": "#1d1f20", "--accent": "#5980a6", "--accent-text": "#416180" };
  const night: Record<PaletteToken, string> = { "--surface-0": "#000000", "--ink-1": "#ededed", "--accent": "#5980a6", "--accent-text": "#b5d9fd" };

  it("lights the part in the accent by Day, and in the accent's text colour at Night", () => {
    expect(byte(readPalette((t) => day[t], false)!.steel)).toEqual([89, 128, 166]);
    expect(byte(readPalette((t) => night[t], true)!.steel)).toEqual([181, 217, 253]);
  });

  it("mixes the scan's steel from the accent, toward ink and ground", () => {
    const d = readPalette((t) => day[t], false)!;
    expect(byte(d.scanDark)).toEqual([65, 89, 112]);
    expect(byte(d.scanLight)).toEqual([165, 185, 205]);
    const n = readPalette((t) => night[t], true)!;
    expect(byte(n.scanDark)).toEqual([45, 64, 83]);
    expect(byte(n.scanLight)).toEqual([133, 161, 187]);
  });

  it("is nothing when a token does not parse", () => {
    expect(readPalette((t) => (t === "--accent" ? "oklch(0.7 0.1 250)" : day[t]), false)).toBeNull();
  });

  it("reads both of the app's themes as they are written today", () => {
    const css = readFileSync(join(__dirname, "../../../../../../src/styles/theme.css"), "utf8");
    const values = (token: string) => [...css.matchAll(new RegExp(`${token}:\\s*([^;]+);`, "g"))].map((m) => m[1]!.trim());
    for (const theme of [0, 1]) {
      const read = (t: PaletteToken) => values(t)[theme] ?? "";
      expect(readPalette(read, theme === 1), `theme ${theme}`).not.toBeNull();
    }
    expect(PALETTE_TOKENS).toEqual(["--surface-0", "--ink-1", "--accent", "--accent-text"]);
  });

  it("reads the system's own colours under forced colours, as the still's currentColor does (spec §3.G; J5-21)", () => {
    const asked: string[] = [];
    const read = systemReader((keyword) => {
      asked.push(keyword);
      return "rgb(0, 0, 0)";
    });
    expect(readPalette(read, false)).not.toBeNull();
    expect(asked).toEqual(["Canvas", "CanvasText", "Highlight", "LinkText"]);
  });

  it("writes a colour back for a canvas", () => {
    expect(cssRgb(mix({ r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 }, 0.5))).toBe("rgb(128 128 128)");
  });
});
