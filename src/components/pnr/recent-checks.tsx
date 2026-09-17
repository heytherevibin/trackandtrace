"use client";

import { useId } from "react";
import { messages } from "@/messages";
import { useRecentChecks, type RecentCheck } from "@/services/stores/recent-store";
import { formatPnr } from "@/utils/pnr";
import { statusLabel } from "@/utils/status-tone";

// "Recent on this device", as drawn along the foot of the check plate: a dashed
// rule, the legend, up to four chips, and Clear. A chip puts its PNR back into
// the entry block; it does not navigate.

const SHOWN = 4;

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
    <div role="group" aria-labelledby={titleId} data-testid="recent-strip" className="perforation -mx-5 -mb-5 mt-4 flex flex-wrap items-center gap-2 px-5 py-3">
      <span id={titleId} className="font-display text-2xs font-semibold uppercase leading-normal tracking-caps text-ink-1/70">
        {m.title}
      </span>
      {recent.slice(0, SHOWN).map((r) => {
        const status = chipStatus(r);
        return (
          <button
            key={r.pnr}
            type="button"
            data-testid="recent-item"
            onClick={() => onPick(r.pnr)}
            className="press inline-flex cursor-pointer items-center gap-2 border border-line bg-transparent px-2.5 py-1 font-display text-xs font-semibold leading-normal tracking-brand text-ink-1 tnum hover:bg-accent/10"
          >
            {formatPnr(r.pnr)}
            {status ? <span className="text-2xs uppercase leading-normal text-ink-1/65">{status}</span> : null}
          </button>
        );
      })}
      <button
        type="button"
        onClick={clear}
        className="press ml-auto cursor-pointer border-0 bg-transparent px-1.5 py-1 font-display text-2xs font-semibold uppercase leading-normal tracking-caps text-ink-1/65 hover:text-ink-1"
      >
        {m.clear}
      </button>
    </div>
  );
}
