import type { ReactNode } from "react";
import { BottomTabBar } from "./bottom-tab-bar";
import { InstallPrompt } from "./install-prompt";
import { Footer } from "./footer";
import { SkipLink } from "./skip-link";
import { TopNav } from "./top-nav";

export function AppShell({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <TopNav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <Footer />
      <BottomTabBar />
      <InstallPrompt />
    </div>
  );
}
