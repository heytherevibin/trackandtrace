import type { ReactNode } from "react";
import { InstallPrompt } from "./install-prompt";
import { Footer } from "./footer";
import { SkipLink } from "./skip-link";
import { TopNav } from "./top-nav";

/** Masthead, page, footer: the B sheets' frame on every route. */
export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface-0 text-ink-1">
      <SkipLink />
      <TopNav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <InstallPrompt />
    </div>
  );
}
