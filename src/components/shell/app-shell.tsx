import { Suspense, type ReactNode } from "react";
import { OfflineBanner } from "./offline-banner";
import { SiteNoticeSlot } from "./site-notice-slot";
import { Footer } from "./footer";
import { SkipLink } from "./skip-link";
import { TabBar } from "./tab-bar";
import { TopNav } from "./top-nav";
import { UpdatesBand } from "./updates-band";

/**
 * Masthead, the offline and site notices under it, page, the Updates by email band where a page has it, footer, and on
 * a phone the tab bar: the frame on every traveller route (Neubrutal v4).
 */
export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col text-ink-1">
      <SkipLink />
      <TopNav />
      <OfflineBanner />
      {/* Under the masthead, never over it (Notices.dc.html). Suspense, so the settings read never holds the page up. */}
      <Suspense fallback={null}>
        <SiteNoticeSlot />
      </Suspense>
      <main id="main" className="flex-1">
        {children}
      </main>
      <UpdatesBand />
      <Footer />
      <TabBar />
    </div>
  );
}
