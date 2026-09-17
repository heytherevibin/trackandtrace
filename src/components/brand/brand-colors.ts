// Literal colours for surfaces that cannot read CSS variables (ImageResponse,
// manifest, theme-color meta). Must equal src/styles/theme.css; the contract
// test enforces parity.

export const LIGHT = {
  surface0: "#e7e5df",
  ink1: "#1c1c1e",
  accent: "#c4531a",
  keyRed: "#ff3b30",
  keyOrange: "#ff9a00",
  keyYellow: "#ffe100",
  keyWhite: "#f2f2f2",
  readoutBg: "#141416",
  readoutFg: "#ff3b30",
} as const;

export const DARK = {
  surface0: "#1a1a1c",
  ink1: "#f2f2f2",
  accent: "#d8322a",
  keyRed: "#ff3b30",
  keyOrange: "#ff9a00",
  keyYellow: "#ffe100",
  keyWhite: "#f2f2f2",
  readoutBg: "#0e0e10",
  readoutFg: "#ff3b30",
} as const;
