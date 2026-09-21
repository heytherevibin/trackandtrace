// Literal colours for surfaces that cannot read CSS variables (ImageResponse,
// manifest, theme-color meta, the brand mark). Must equal src/styles/theme.css;
// the contract test enforces parity.

export const LIGHT = {
  surface0: "#f2f2f3",
  surface1: "#e9e9ea",
  ink1: "#1d1f20",
  ink3: "#5d5e5f",
  accent: "#5980a6",
  accentText: "#416180",
  line: "#d0d0d1",
} as const;

export const DARK = {
  surface0: "#000000",
  surface1: "#0a0a0a",
  ink1: "#ededed",
  ink3: "#8f8f8f",
  accent: "#5980a6",
  accentText: "#b5d9fd",
  line: "#2f2f2f",
} as const;

// The mark keeps its own plate on both faces: three keys and a lit lamp.
export const MARK = {
  plate: "#1a1a1c",
  plateEdge: "#55555b",
  keyOne: "#ff3b30",
  keyTwo: "#ff9a00",
  keyThree: "#ffe100",
  lamp: "#ff3b30",
} as const;
