import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import "../globals.css";
import { DARK, LIGHT } from "@/components/brand/brand-colors";
import { consoleAvailability } from "@/console/availability";
import { ConsoleProviders } from "@/console/components/console-providers";
import { Unavailable } from "@/console/components/unavailable";
import { isConsoleHost } from "@/console/hosts";
import { env } from "@/services/env";
import { supabasePublicEnv } from "@/services/supabase/public-env";
import { fontVars } from "../fonts";

export const metadata: Metadata = {
  title: { default: "Trakline console", template: "%s · Trakline console" },
  robots: { index: false, follow: false, nocache: true },
  // The root layout's manifest would otherwise be inherited onto every console document, but the
  // console's own CSP sets manifest-src 'none' and the proxy 404s the path (src/console/csp.ts).
  manifest: null,
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

// The console's own root layout: its own document, the shared tokens and fonts, and none of the traveller shell.
// Reading headers() makes every console page dynamic, which the nonce policy needs.
export default async function ConsoleLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requested = await headers();
  const current = env();
  // A backstop behind the proxy: this tree renders only on the console host.
  if (!isConsoleHost(requested.get("host"), current.VERCEL_ENV)) notFound();
  // The same Supabase URL the Supabase clients read, not env()'s own copy: env() defaults it away
  // whenever any other variable is invalid outside production, which would report "available"
  // while the clients still point at the hosted project (src/console/availability.ts).
  const availability = consoleAvailability({ VERCEL_ENV: current.VERCEL_ENV, NEXT_PUBLIC_SUPABASE_URL: supabasePublicEnv.url });
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <body className="bg-surface-0 text-ink-1">
        <ConsoleProviders nonce={requested.get("x-nonce") ?? undefined}>
          {availability === "available" ? children : <Unavailable reason={availability} />}
        </ConsoleProviders>
      </body>
    </html>
  );
}
