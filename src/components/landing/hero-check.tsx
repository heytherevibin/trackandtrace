"use client";

import { useCallback, useState, type ReactNode } from "react";
import { PnrTerminal } from "@/components/pnr/pnr-terminal";
import { InstallPrompt } from "@/components/shell/install-prompt";

/**
 * The hero's grid, with the check plate in its second column and the install plate after it (v4): the install plate
 * waits for a check that came back with a record. The promise (the first column) is drawn on the server.
 */
export function HeroCheck({ sampleMode, connected, children }: { readonly sampleMode: boolean; readonly connected: boolean; readonly children: ReactNode }) {
  const [hadRecord, setHadRecord] = useState(false);
  const onResult = useCallback((ok: boolean) => {
    if (ok) setHadRecord(true);
  }, []);
  return (
    <>
      <section
        aria-labelledby="hero-title"
        className="hero grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-start gap-x-[clamp(24px,4vw,64px)] gap-y-12 pb-16 pt-[clamp(40px,7vw,96px)] max-sm:grid-cols-1 max-sm:gap-y-6 max-sm:pb-8 max-sm:pt-4"
      >
        <div className="min-w-0 max-sm:order-2 max-sm:pt-2">{children}</div>
        <PnrTerminal sampleMode={sampleMode} connected={connected} onResult={onResult} />
      </section>
      <InstallPrompt shown={hadRecord} />
    </>
  );
}
