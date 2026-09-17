import { Barlow, Barlow_Condensed, Chakra_Petch, JetBrains_Mono } from "next/font/google";

// Faces of the instrument: Chakra Petch for the squared display voice, Barlow
// for body copy, Barlow Condensed for silkscreen legends, JetBrains Mono for
// data. Only layout.tsx and metadata routes import this module.

export const bodyFace = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--font-face-body" });
export const labelFace = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600"], display: "swap", variable: "--font-face-label" });
export const displayFace = Chakra_Petch({ subsets: ["latin"], weight: ["600", "700"], display: "swap", variable: "--font-face-display" });
export const monoFace = JetBrains_Mono({ subsets: ["latin"], display: "swap", variable: "--font-face-mono" });

export const fontVars = [bodyFace.variable, labelFace.variable, displayFace.variable, monoFace.variable].join(" ");
