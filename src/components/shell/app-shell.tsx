import { Suspense, type ReactNode } from "react";
import { InstallPrompt } from "./install-prompt";
import { SiteNoticeSlot } from "./site-notice-slot";
import { Footer } from "./footer";
import { SkipLink } from "./skip-link";
import { TopNav } from "./top-nav";
import { UpdatesBand } from "./updates-band";

/** Masthead, page, the Updates by email band where a page has it, footer: the frame on every traveller route. */
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
      <UpdatesBand />
      <Footer />
      <InstallPrompt />
    </div>
  );
}
