"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { messages } from "@/messages";
import { useRecentChecks } from "@/services/stores/recent-store";
import { formatRelative } from "@/utils/datetime";
import { formatPnr } from "@/utils/pnr";

/** The last few PNRs checked on this device, one tap to re-check. Hidden when empty. */
export function RecentChecks() {
  const { recent, clear } = useRecentChecks();
  if (recent.length === 0) return null;
  const m = messages.watchlist.recent;
  return (
    <section className="mt-8" aria-labelledby="recent-title" data-testid="recent-strip">
      <div className="flex items-center justify-between gap-4">
        <h2 id="recent-title" className="silk">
          {m.title}
        </h2>
        <Button variant="ghost" size="sm" onClick={clear}>
          {m.clear}
        </Button>
      </div>
      <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {recent.map((r) => (
          <li key={r.pnr} className="shrink-0">
            <Link href={`/pnr/${r.pnr}`} className="press flex flex-col gap-2 rounded-md border border-line bg-surface-1 px-3 py-2 hover:border-line-strong" data-testid="recent-item">
              <span className="font-data text-sm text-ink-1">{formatPnr(r.pnr)}</span>
              <span className="flex items-center gap-2">
                {r.status ? <StatusPill status={r.status} position={r.position ?? null} size="sm" /> : null}
                <span className="text-xs text-ink-3">{formatRelative(r.checkedAt)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
