import { Archivo_Black, Barlow, Barlow_Condensed, Inter, Space_Grotesk, Space_Mono } from "next/font/google";

// The Industry pairing (the console): Barlow Condensed for headings, legends, and figures; Barlow for body copy.
// Glyphs outside the Latin subset (→) fall back to the system font, as they do on the sheets, so no metric-adjusted
// Arial fallback. Only layout.tsx and metadata routes import this module.

export const bodyFace = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", adjustFontFallback: false, variable: "--font-face-body" });
export const headingFace = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600"], display: "swap", adjustFontFallback: false, variable: "--font-face-heading" });

export const fontVars = [bodyFace.variable, headingFace.variable].join(" ");

// The Neubrutal v4 four (the traveller site): Archivo Black display, Space Grotesk structure, Inter copy, Space Mono
// figures and legends. neubrutal.css points the shared roles at them; only the site's layout declares them.
const archivoFace = Archivo_Black({ subsets: ["latin"], weight: "400", display: "swap", variable: "--font-face-archivo" });
const groteskFace = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], display: "swap", variable: "--font-face-grotesk" });
const interFace = Inter({ subsets: ["latin"], display: "swap", variable: "--font-face-inter" });
const monoFace = Space_Mono({ subsets: ["latin"], weight: ["400", "700"], display: "swap", variable: "--font-face-mono" });

export const siteFontVars = [archivoFace.variable, groteskFace.variable, interFace.variable, monoFace.variable].join(" ");
