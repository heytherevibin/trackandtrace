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

// The traveller site's Neubrutal face (src/styles/neubrutal.css). The console keeps LIGHT and DARK above.
export const NEUBRUTAL_LIGHT = {
  bg: "#fff8e7",
  paper: "#ffffff",
  ink1: "#111111",
  ink3: "#4f4f4f",
  edge: "#111111",
  accent: "#ffd93d",
  pink: "#ff8fcf",
  link: "#1a36d6",
} as const;

export const NEUBRUTAL_DARK = {
  bg: "#0e0e0f",
  paper: "#1a1a1c",
  ink1: "#f4f4f4",
  ink3: "#bebebe",
  edge: "#e9e9e9",
  accent: "#ffd93d",
  pink: "#ff8fcf",
  link: "#9dbdff",
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
