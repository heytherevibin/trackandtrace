import { Suspense, type ReactNode } from "react";
import { InstallPrompt } from "./install-prompt";
import { SiteNoticeSlot } from "./site-notice-slot";
import { Footer } from "./footer";
import { SkipLink } from "./skip-link";
import { TopNav } from "./top-nav";

/** Masthead, page, footer: the B sheets' frame on every route. */
export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col text-ink-1">
      <SkipLink />
      <TopNav />
      {/* Under the masthead, never over it (Notices.dc.html). Suspense, so the settings read never holds the page up. */}
      <Suspense fallback={null}>
        <SiteNoticeSlot />
      </Suspense>
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <InstallPrompt />
    </div>
  );
}
