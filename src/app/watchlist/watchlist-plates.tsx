"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button, buttonClassName } from "@/components/ui/button";
import { Corners } from "@/components/ui/corners";
import { messages } from "@/messages";
import type { WatchlistEntry } from "@/types/domain";
import { BUTTON_LEADING, WatchlistRow } from "./watchlist-row";

// The Watchlist sheet's objects: the saved-PNR plate, the empty plate, and the account sync note.

const HEAD_CELL = "px-5 py-2.5 font-display text-label font-semibold uppercase leading-6 tracking-caps";
const TH = "border-b border-line px-5 py-2.5 font-display text-xs font-semibold uppercase leading-normal tracking-caps text-ink-1/70";
const TITLE_ID = "watchlist-plate-title";

export function SavedPlate({
  title,
  sampleData,
  entries,
  busy,
  onRecheck,
  onRemove,
}: {
  readonly title: string;
  readonly sampleData: boolean;
  readonly entries: readonly WatchlistEntry[];
  readonly busy: ReadonlySet<string>;
  readonly onRecheck: (pnr: string) => void;
  readonly onRemove: (pnr: string) => void;
}) {
  const c = messages.watchlist.columns;
  return (
    <div className="blueprint mt-4">
      <Corners />
      <div className="flex flex-wrap items-stretch border-b border-line">
        <span id={TITLE_ID} className={`${HEAD_CELL} min-w-[14ch] flex-1`}>
          {title}
        </span>
        {sampleData ? (
          <span title={messages.common.sampleDataHint} className={`${HEAD_CELL} whitespace-nowrap border-l border-line text-ink-1/70`}>
            {messages.common.sampleData}
          </span>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table aria-labelledby={TITLE_ID} className="w-full min-w-[720px] border-collapse text-body leading-normal">
          <thead>
            <tr>
              <th scope="col" className={`${TH} text-left`}>
                {c.pnr}
              </th>
              <th scope="col" className={`${TH} text-left`}>
                {c.journey}
              </th>
              <th scope="col" className={`${TH} text-left`}>
                {c.status}
              </th>
              <th scope="col" className={`${TH} text-left`}>
                {c.checked}
              </th>
              <th scope="col" className={`${TH} text-right`}>
                {c.actions}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <WatchlistRow key={entry.pnr} entry={entry} busy={busy.has(entry.pnr)} onRecheck={onRecheck} onRemove={onRemove} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function UndoButton({ onUndo }: { readonly onUndo: () => void }) {
  return (
    <Button variant="ghost" className={BUTTON_LEADING} onClick={onUndo}>
      {messages.watchlist.undo}
    </Button>
  );
}

export function EmptyPlate({ undo }: { readonly undo: ReactNode }) {
  const m = messages.watchlist.empty;
  return (
    <div className="blueprint mt-4 p-[clamp(28px,4vw,48px)]">
      <Corners />
      <h2 className="text-3xl leading-[1.12] tracking-head">{m.title}</h2>
      <p className="mt-3 max-w-[52ch] text-body text-ink-1/78">{m.detail}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/#terminal" className={buttonClassName({ variant: "primary", className: BUTTON_LEADING })}>
          {m.action}
        </Link>
        {undo}
      </div>
    </div>
  );
}

export function SyncNote({ signedIn }: { readonly signedIn: boolean }) {
  const m = messages.watchlist.sync;
  const caps = "font-display text-label font-semibold uppercase leading-normal tracking-caps";
  return (
    <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 border border-line px-5 py-4">
      <span className={`${caps} text-accent-text`}>{m.title}</span>
      <span className="min-w-[240px] flex-1 text-sm text-ink-1/74">{signedIn ? m.signed : m.anon}</span>
      <Link href={signedIn ? "/account" : "/login"} className={`${caps} no-underline`}>
        {signedIn ? m.signedAction : m.anonAction} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
