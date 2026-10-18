"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { messages } from "@/messages";
import { useRecentChecks, type RecentCheck } from "@/services/stores/recent-store";
import { formatPnr } from "@/utils/pnr";
import { statusLabel } from "@/utils/status-tone";

// The rows along the foot of the check plate, as Neubrutal v4 draws them: under a dashed rule, a legend and the chips.
// "Recent" holds this device's last few checks, and a chip puts its PNR back into the entry; it does not navigate.
// "Sample PNRs" (sample mode only) puts a fixture PNR in and runs it.

const SHOWN = 4;
// Rows of chips stand 12px apart: each chip's 44px finger overlay (tap-44) reaches 6px past its 32px.
const ROW = "flex flex-wrap items-center gap-x-2 gap-y-3 border-t-2 border-dashed border-edge px-4 py-3 -mx-4 -mb-4 mt-4 max-sm:-mx-3 max-sm:-mb-3 max-sm:px-3";
const CHIP =
  "nb-press tap-44 inline-flex min-h-8 max-w-full cursor-pointer flex-wrap items-center gap-x-2 rounded-control border-2 border-edge bg-paper px-2.5 font-figure text-xs leading-4 text-ink-1 tnum hover:bg-accent hover:text-on-fill";

function chipStatus(r: RecentCheck): string | null {
  if (r.status) return statusLabel(r.status, r.position ?? null);
  return r.label ?? null;
}

export function RecentChecks({ onPick }: { readonly onPick: (pnr: string) => void }) {
  const { recent, clear } = useRecentChecks();
  const titleId = useId();
  if (recent.length === 0) return null;
  const m = messages.check.recent;
  return (
    <div role="group" aria-label={m.listLabel} data-testid="recent-strip" className={ROW}>
      <span id={titleId} className="legend">
        {m.short}
      </span>
      {recent.slice(0, SHOWN).map((r) => {
        const status = chipStatus(r);
        return (
          <button key={r.pnr} type="button" data-testid="recent-item" onClick={() => onPick(r.pnr)} className={CHIP}>
            {formatPnr(r.pnr)}
            {status ? <span className="uppercase text-ink-3">{status}</span> : null}
          </button>
        );
      })}
      <Button variant="ghost" size="sm" onClick={clear} className="ml-auto text-xs">
        {m.clear}
      </Button>
    </div>
  );
}

export function SamplePnrs({ onPick }: { readonly onPick: (pnr: string) => void }) {
  const m = messages.check.samples;
  return (
    <div role="group" aria-label={m.listLabel} data-testid="sample-strip" className={ROW}>
      <span className="legend">{m.title}</span>
      {m.items.map((s) => (
        <button key={s.pnr} type="button" onClick={() => onPick(s.pnr)} className={CHIP}>
          {formatPnr(s.pnr)}
          <span className="uppercase text-ink-3">{s.label}</span>
        </button>
      ))}
    </div>
  );
}
