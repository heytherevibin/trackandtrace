import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DARK, LIGHT } from "@/components/brand/brand-colors";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell/app-shell";
import { PwaRegister } from "@/components/shell/pwa-register";
import { currentUser } from "@/services/session";
import { fontVars } from "./fonts";

export const metadata: Metadata = {
  title: {
    default: "Track & Trace — PNR status from the source",
    template: "%s · Track & Trace",
  },
  description:
    "Enter a 10-digit Indian Railways PNR and read exactly what the verified source returned, with its name and retrieval time. Free, no account needed.",
  applicationName: "Track & Trace",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Track & Trace" },
  openGraph: {
    title: "Track & Trace — PNR status from the source",
    description: "Only the fields the railway source returned, with provenance and retrieval time. Free, no account.",
    type: "website",
    siteName: "Track & Trace",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: LIGHT.surface0 },
    { media: "(prefers-color-scheme: dark)", color: DARK.surface0 },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Un-awaited on purpose: the shell streams and loading boundaries still show.
  const userPromise = currentUser();
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <body className="bg-surface-0 text-ink-1">
        {/*
IMPECCABLE DIRECTION CONTRACT — seed c2e5f350
THESIS: A PNR check is a ten-step pattern you punch in and run; the machine shows exactly which step it is on and refuses the category's dashboard of guesses.
OWN-WORLD: Matte instrument panel (808 charcoal by night, 909 cream by day), ten colour-quartered key caps in one unbroken row, red seven-segment readouts for digits, green/amber/red LEDs for status, silkscreen caps for every label; no cards, no glow beyond LEDs.
STORY: The traveler types ten digits into the row, presses RUN, watches the chase light cross validation, source, and result, then reads the LED and the readout; if the source is silent, the light stops at SOURCE and says so.
FIRST VIEWPORT: Header strip with the name and a plain descriptor; the full-width ten-key row with the chase-light strip above it and the RUN key at its end; a segmented readout echoing the digits; three silkscreen assurances beneath; on phones the row spans the screen.
FORM: Rhythm Machine Step Row, a dealt challenger adopted by the user over the assigned Trains at a Glance; seed key c2e5f350.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md.
*/}
        <Providers userPromise={userPromise}>
          <PwaRegister />
          <div id="app-root">
            <AppShell>{children}</AppShell>
          </div>
        </Providers>
      </body>
    </html>
  );
}
