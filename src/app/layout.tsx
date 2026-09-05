import type { Metadata, Viewport } from "next";
import { Archivo, Inter, JetBrains_Mono } from "next/font/google";
import { AppShell, PwaRegister } from "@/components/shell";
import { Providers } from "@/components/providers";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  display: "swap",
  variable: "--font-archivo",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Track & Trace — PNR intelligence",
    template: "%s · Track & Trace",
  },
  description:
    "Enter a 10-digit PNR and get an honest, explainable read on whether your seat confirms before chart time. Journey intelligence for Indian Railways.",
  applicationName: "Track & Trace",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Track & Trace",
  },
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    title: "Track & Trace — PNR intelligence",
    description:
      "An honest, explainable confirmation read before chart time. Journey intelligence for Indian Railways.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#06080b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${inter.variable} ${jetbrainsMono.variable} antialiased`}>
      <body className="bg-ink-0 text-bone">
        {/* The Destiny Clock — direction contract
        THESIS: Railway time decides every ticket. The product is a precision
          instrument that reads a PNR and shows, on one master clock, whether
          the seat frees before chart time — refusing the category's plain
          utility-page default.
        OWN-WORLD: Lacquered instrument grounds, dial-bone luminous markings,
          steel hairlines and brass detailing; signal aspects (green / amber /
          red) used strictly as destiny states. Data is always set in a mono
          instrument face. No stock chrome anywhere — every atom machined.
        STORY: A traveler keys ten digits and watches one honest light resolve
          — the odds dial sweeping, the chart hand racing — with the reasoning
          that earned it laid out as a factored readout.
        FIRST VIEWPORT: Twin instrument faces — CONFIRMATION ODDS and TIME TO
          CHART — flanking an engraved PNR terminal; submit sweeps the needle
          while the red hand races chart preparation.
        FORM: Grounded direction #5 of seven from the Indian-rail cultural
          world (concept-seed key 06ec86fe), raised by variable-font-specimen,
          ocean-depth-dive, miura-orbit-sheet, zoo-gardens-map and
          streaming-wall.
        FINISH: unreviewed and undocumented is unfinished; this build ends
          with the finish review, the verdict, and DESIGN.md */}
        <Providers>
        <PwaRegister />
        <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(90% 60% at 50% -5%, rgba(236,228,210,0.06), transparent 55%)",
            }}
          />
          <div
            className="absolute -top-40 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full opacity-[0.05]"
            style={{
              background:
                "conic-gradient(from 0deg, transparent 0deg, var(--bone) 40deg, transparent 90deg, transparent 200deg, var(--bone) 250deg, transparent 300deg)",
            }}
          />
          <div className="scanline absolute inset-0" />
          <div className="vignette absolute inset-0" />
        </div>
        <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
