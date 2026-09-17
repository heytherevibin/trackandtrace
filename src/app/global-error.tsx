"use client";

import "./globals.css";
import { THEME_BOOT_SCRIPT } from "@/components/theme/theme-boot";
import { ErrorState } from "@/components/ui/error-state";

/** Renders its own document: no providers, no theme context, only the token faces and the boot script. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="bg-surface-0 text-ink-1">
        <section className="mx-auto w-full max-w-prose px-4 py-12 sm:px-6">
          <ErrorState digest={error.digest} onRetry={retry} />
        </section>
      </body>
    </html>
  );
}
