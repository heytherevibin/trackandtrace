"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button, buttonClassName } from "@/components/ui/button";
import { Corners } from "@/components/ui/corners";
import { PLATE_TITLE_STACK, plateCellClass } from "@/components/ui/plate";
import { STACKED_ROLES as R, stackedTable } from "@/components/ui/stacked-table";
import { messages } from "@/messages";
import type { WatchlistEntry } from "@/types/domain";
import { WatchlistRow } from "./watchlist-row";

// The Watchlist sheet's objects: the saved-PNR plate, the empty plate, and the account sync note.

const HEAD_CELL = "px-5 py-2.5 font-display text-label font-semibold uppercase leading-6 tracking-caps";
const TH = "border-b border-line px-5 py-2.5 font-display text-xs font-semibold uppercase leading-normal tracking-caps text-ink-1/70";
const TITLE_ID = "watchlist-plate-title";
const S = stackedTable("lg");

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
        <span id={TITLE_ID} className={`${HEAD_CELL} min-w-[14ch] flex-1 ${sampleData ? PLATE_TITLE_STACK : ""}`}>
          {title}
        </span>
        {sampleData ? (
          <span title={messages.common.sampleDataHint} className={`${HEAD_CELL} whitespace-nowrap border-l border-line text-ink-1/70 ${plateCellClass(0)}`}>
            {messages.common.sampleData}
          </span>
        ) : null}
      </div>
      <div className="overflow-x-auto">
        <table role={R.table} aria-labelledby={TITLE_ID} className={`w-full border-collapse text-body leading-normal lg:min-w-[720px] ${S.table}`}>
          <thead role={R.rowgroup} className={S.head}>
            <tr role={R.row}>
              <th role={R.columnheader} scope="col" className={`${TH} text-left`}>
                {c.pnr}
              </th>
              <th role={R.columnheader} scope="col" className={`${TH} text-left`}>
                {c.journey}
              </th>
              <th role={R.columnheader} scope="col" className={`${TH} text-left`}>
                {c.status}
              </th>
              <th role={R.columnheader} scope="col" className={`${TH} text-left`}>
                {c.checked}
              </th>
              <th role={R.columnheader} scope="col" className={`${TH} text-right`}>
                {c.actions}
              </th>
            </tr>
          </thead>
          <tbody role={R.rowgroup} className={S.body}>
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
    <Button variant="ghost" onClick={onUndo}>
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
        <Link href="/#terminal" className={buttonClassName({ variant: "primary" })}>
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
      {/* A capital link, not a button: 20px of drawn height, so it takes the coarse-pointer hit area (motion.css). */}
      <Link href={signedIn ? "/account" : "/login"} className={`${caps} tap-44 no-underline`}>
        {signedIn ? m.signedAction : m.anonAction} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}
