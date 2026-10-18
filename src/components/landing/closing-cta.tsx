"use client";

import { TERMINAL_ID } from "@/components/shell/nav-config";
import { PlateHeader } from "@/components/ui/plate";
import { messages } from "@/messages";
import { TerminusStage } from "./journey/terminus-stage";

/** Scrolls to the check plate and puts the caret in it, as v4's "Run a check" does. */
function focusTerminal(): void {
  const plate = document.getElementById(TERMINAL_ID);
  if (!plate) return;
  plate.scrollIntoView({ block: "start" });
  window.setTimeout(() => plate.querySelector<HTMLInputElement>("input[name='pnr']")?.focus({ preventScroll: true }), 500);
}

/** The close: the train arrived at the terminus, over v4's yellow plate — "Only what the railway returned." */
export function ClosingCta() {
  const m = messages.home.closing;
  return (
    <section id="terminus" aria-label={m.title} className="border-t-2 border-edge pb-24 pt-12 max-sm:pb-8 max-sm:pt-6">
      <TerminusStage />
      {/* Yellow (v4): the header and the headline take the fill's ink; the Run a check key keeps the page's own. */}
      <div className="blueprint nb-fill-accent">
        <div className="nb-on-accent">
          <PlateHeader title={m.title} meta={[m.meta]} />
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4 px-4 py-6">
          <h2 className="nb-on-accent nb-section m-0 min-w-[min(15rem,100%)] flex-1">{m.headline}</h2>
          <button type="button" onClick={focusTerminal} className="nb-press inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border-2 border-edge bg-paper px-4 font-structure text-sm font-bold leading-5 text-ink-1 shadow-control hover:bg-pink hover:text-on-fill">
            {m.action}
          </button>
        </div>
      </div>
    </section>
  );
}
