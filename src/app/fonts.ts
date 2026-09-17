import { Barlow, Barlow_Condensed } from "next/font/google";

// The Industry pairing: Barlow Condensed for headings, legends, and figures;
// Barlow for body copy. Only layout.tsx and metadata routes import this module.

export const bodyFace = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--font-face-body" });
export const headingFace = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600"], display: "swap", variable: "--font-face-heading" });

export const fontVars = [bodyFace.variable, headingFace.variable].join(" ");
