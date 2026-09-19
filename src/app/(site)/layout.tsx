import type { Metadata, Viewport } from "next";
import "../globals.css";
import { DARK, LIGHT } from "@/components/brand/brand-colors";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell/app-shell";
import { PwaRegister } from "@/components/shell/pwa-register";
import { currentUser } from "@/services/session";
import { fontVars } from "../fonts";

export const metadata: Metadata = {
  title: {
    default: "Trakline — PNR status from the source",
    template: "%s · Trakline",
  },
  description:
    "Enter a 10-digit Indian Railways PNR and read exactly what the verified source returned, with its name and retrieval time. Free, no account needed.",
  applicationName: "Trakline",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Trakline" },
  openGraph: {
    title: "Trakline — PNR status from the source",
    description: "Only the fields the railway source returned, with provenance and retrieval time. Free, no account.",
    type: "website",
    siteName: "Trakline",
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
    <html lang="en" className={fontVars} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="bg-surface-0 text-ink-1">
        {/*
DIRECTION CONTRACT — Industry (Claude Design "Landing Redesign B")
THESIS: A PNR check is a drawing of a record: square hairline plates, registration marks, condensed capitals, one steel accent.
WORLD: Light technical ground by day, steel-blue ground by night; plates are transparent line drawings; the primary button is the one solid object.
STORY: Punch ten digits into the ticket-stub plate, press Run, read the record the source returned with its provenance.
GRAMMAR: DESIGN.md is the contract; tokens in src/styles, primitives in src/components/ui.
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
