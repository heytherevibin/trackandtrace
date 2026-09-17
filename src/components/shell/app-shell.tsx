import type { ReactNode } from "react";
import { BottomTabBar } from "./bottom-tab-bar";
import { InstallPrompt } from "./install-prompt";
import { Footer } from "./footer";
import { SkipLink } from "./skip-link";
import { TopNav } from "./top-nav";

export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <TopNav />
      <main id="main" className="min-h-dvh pb-(--tabbar-height) pt-(--nav-height) md:pb-0">
        {children}
      </main>
      <Footer />
      <BottomTabBar />
      <InstallPrompt />
    </>
  );
}
