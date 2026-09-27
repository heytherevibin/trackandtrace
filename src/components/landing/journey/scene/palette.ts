// The live drawing's colours from the theme's own tokens (spec §3.E; J5-8): the sheet, the ink, the steel accent and
// its text colour, and the scan's steel shades mixed from them. No hex and no three.js here: the engine turns these
// into three.js colours (in sRGB), and re-reads them whenever the theme changes.

/** A colour as sRGB channels, 0..1. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface ScenePalette {
  readonly night: boolean;
  /** --surface-0: the fills that hide lines behind them, and the fog. */
  readonly ground: Rgb;
  /** --ink-1: every hairline, and the nameboard's letters. */
  readonly ink: Rgb;
  /** The lit part: --accent by Day, --accent-text at Night (v3). */
  readonly steel: Rgb;
  /** --accent-text: the dimension lines, the scan's gate, the glow and the beam. */
  readonly steelText: Rgb;
  readonly scanDark: Rgb;
  readonly scanLight: Rgb;
}

export const PALETTE_TOKENS = ["--surface-0", "--ink-1", "--accent", "--accent-text"] as const;
export type PaletteToken = (typeof PALETTE_TOKENS)[number];

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i;

export function parseColor(raw: string): Rgb | null {
  const value = raw.trim();
  const hex = HEX.exec(value)?.[1];
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    const channel = (i: number) => Number.parseInt(full.slice(i, i + 2), 16) / 255;
    return { r: channel(0), g: channel(2), b: channel(4) };
  }
  const fn = RGB.exec(value);
  if (!fn) return null;
  const [r = Number.NaN, g = Number.NaN, b = Number.NaN] = [fn[1], fn[2], fn[3]].map((c) => Number(c) / 255);
  return [r, g, b].every((c) => Number.isFinite(c) && c >= 0 && c <= 1) ? { r, g, b } : null;
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

/** The scene's palette from four tokens; null when any of them is not a colour this parser reads. */
export function readPalette(read: (token: PaletteToken) => string, night: boolean): ScenePalette | null {
  const [ground, ink, accent, accentText] = PALETTE_TOKENS.map((token) => parseColor(read(token)));
  if (!ground || !ink || !accent || !accentText) return null;
  return {
    night,
    ground,
    ink,
    steel: night ? accentText : accent,
    steelText: accentText,
    scanDark: night ? mix(accent, ground, 0.5) : mix(accent, ink, 0.4),
    scanLight: night ? mix(accent, ink, 0.3) : mix(accent, ground, 0.5),
  };
}

/** Reads the tokens as the page resolves them now. */
export function tokenReader(root: Element = document.documentElement): (token: PaletteToken) => string {
  const style = getComputedStyle(root);
  return (token) => style.getPropertyValue(token);
}

/** Forced colours (spec §3.G; J5-21): the system's own colours stand in for the tokens, as currentColor does for the still. */
export const SYSTEM_COLOURS: Readonly<Record<PaletteToken, string>> = { "--surface-0": "Canvas", "--ink-1": "CanvasText", "--accent": "Highlight", "--accent-text": "LinkText" };

/** A system colour keyword as the page resolves it now, through a hidden probe. */
function computedColour(keyword: string): string {
  const probe = document.createElement("span");
  probe.style.display = "none";
  probe.style.color = keyword;
  document.body.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

export function systemReader(resolve: (keyword: string) => string = computedColour): (token: PaletteToken) => string {
  return (token) => resolve(SYSTEM_COLOURS[token]);
}

/** A colour for a 2D canvas (the nameboard). */
export function cssRgb({ r, g, b }: Rgb): string {
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}
