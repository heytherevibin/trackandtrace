import { Barlow, Barlow_Condensed } from "next/font/google";

// The Industry pairing: Barlow Condensed for headings, legends, and figures;
// Barlow for body copy. Glyphs outside the Latin subset (→) fall back to the
// system font, as they do on the sheets, so no metric-adjusted Arial fallback.
// Only layout.tsx and metadata routes import this module.

export const bodyFace = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", adjustFontFallback: false, variable: "--font-face-body" });
export const headingFace = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600"], display: "swap", adjustFontFallback: false, variable: "--font-face-heading" });

export const fontVars = [bodyFace.variable, headingFace.variable].join(" ");
