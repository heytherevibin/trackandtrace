"use client";

import "./globals.css";
import { Wordmark } from "@/components/brand/wordmark";
import { ErrorSheet } from "@/components/pnr/result-error-sheet";
import { THEME_BOOT_SCRIPT } from "@/components/theme/theme-boot";
import { fontVars } from "./fonts";

/** Renders its own document: no providers or shell, so it draws the sign-in masthead (brand only) over the error sheet. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en" data-theme="light" className={fontVars} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="bg-surface-0 text-ink-1">
        <header className="border-b border-line bg-surface-0">
          <div className="page-frame flex min-h-16 items-center">
            <Wordmark />
          </div>
        </header>
        <main className="page-frame page-body">
          <ErrorSheet digest={error.digest} onRetry={retry} />
        </main>
      </body>
    </html>
  );
}
