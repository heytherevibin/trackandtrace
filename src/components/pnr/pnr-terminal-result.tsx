"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { STACKED_ROLES as R } from "@/components/ui/stacked-table";
import { useOutgrown } from "@/components/ui/use-outgrown";
import { messages } from "@/messages";
import type { PaxRow, TerminalFact, TerminalResult } from "./pnr-terminal-state";
import { SampleTag, SheetTag } from "./pnr-terminal-tags";
import { cn } from "@/utils/cn";
import { pnrHref } from "@/utils/pnr";

// The record rendered in place on the check plate, as drawn: status tag, sample
// tag, PNR; the big status; its description; the framed fact grid and the
// passenger table (hero plate only); provenance; "Check another PNR".

const LEGEND_11 = "font-display text-2xs font-semibold uppercase leading-normal tracking-caps text-ink-1/70";
const TH = `border-b border-line px-3.5 py-2 text-left ${LEGEND_11}`;
const TD = "border-b border-line px-3.5 py-2";

// The passenger table cannot wrap below its own least width (309px as drawn, for the fixture's party of three). It is
// the table only where its frame holds it. Wherever the frame is narrower than the table, at any text size, each
// passenger stacks into a record: the passenger across the top, then booked, current and coach · berth labelled
// beneath. useOutgrown measures the table itself and holds no width of its own; as drawn, the frame is the window less
// 84px on a phone, so the record stacks in every window under 394px (every phone) and is the table from there up.
//
// Stacked, the record's columns are the facts grid's above it (decided 2026-10-05, the owner): Current stands exactly
// under Route and Class · quota. Both grids are cut from the frame's two lengths, FRAME: a fact is at least --fact
// wide, its words --fact-pad in from each side; a stacked cell has no padding of its own, so its track is a fact less
// the two paddings and its gap is the two paddings. A track and its gap are then a fact's width, the row's own padding
// is the first fact's, and the two grids hold as many columns as each other at every width and text size: two on
// every phone (booked and current side by side, coach · berth on a row of its own), one under 13.75rem of frame.
const FRAME = "[--fact:6.875rem] [--fact-pad:0.875rem]";
const FACTS = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,var(--fact)),1fr))]";
const FACT = "px-(--fact-pad) py-2.5";
const STACKED_ROW =
  "grid grid-cols-[repeat(auto-fit,minmax(min(100%,calc(var(--fact)_-_2_*_var(--fact-pad))),1fr))] gap-x-[calc(2_*_var(--fact-pad))] gap-y-2 border-b border-line px-(--fact-pad) py-2.5 last:border-b-0";
const STACKED_CELL = "min-w-0 wrap-break-word before:mb-0.5 before:block before:legend-sm before:text-ink-1/70 before:content-[attr(data-label)_/_'']";

function FactsFrame({ facts, pax }: { readonly facts: readonly TerminalFact[]; readonly pax: readonly PaxRow[] }) {
  const m = messages.check.result.passengers;
  const [frame, stacked] = useOutgrown<HTMLDivElement>();
  const td = stacked ? STACKED_CELL : TD;
  return (
    <div ref={frame} className={`border border-line ${FRAME}`}>
      <dl className={`m-0 ${FACTS}`}>
        {facts.map((f) => (
          <div key={f.label} className={`-mt-px border-t border-line ${FACT}`}>
            <dt className={LEGEND_11}>{f.label}</dt>
            <dd className="m-0 font-data text-lead leading-normal tracking-head">{f.value}</dd>
          </div>
        ))}
      </dl>
      {pax.length > 0 ? (
        // Keyed by its layout: the stacked record is elements of its own, not the table's with their classes swapped.
        // With Motion off every property has a 0.01ms transition (motion.css), so a swap of classes on the same cells
        // left their paddings and borders the table's for one frame under the stacked layout: the record was drawn
        // taller for that frame, and the page under it shifted twice. Elements that are new have nothing to change from.
        <table
          key={stacked ? "stacked" : "table"}
          role={R.table}
          data-stacked={stacked || undefined}
          className={cn("w-full border-collapse border-t border-line text-sm leading-normal", stacked && "block")}
        >
          <caption className="sr-only">{m.caption}</caption>
          <thead role={R.rowgroup} className={stacked ? "sr-only" : undefined}>
            <tr role={R.row}>
              <th role={R.columnheader} scope="col" className={TH}>
                {m.passenger}
              </th>
              <th role={R.columnheader} scope="col" className={TH}>
                {m.booked}
              </th>
              <th role={R.columnheader} scope="col" className={TH}>
                {m.current}
              </th>
              <th role={R.columnheader} scope="col" className={TH}>
                {m.allocation}
              </th>
            </tr>
          </thead>
          <tbody role={R.rowgroup} className={stacked ? "block" : undefined}>
            {pax.map((p) => (
              <tr key={p.key} role={R.row} className={stacked ? STACKED_ROW : "hover:bg-ink-1/4"}>
                <td role={R.cell} className={stacked ? "col-span-full min-w-0 font-semibold wrap-break-word" : TD}>
                  {p.name}
                </td>
                <td role={R.cell} data-label={m.booked} className={`${td} text-ink-1/70 tnum`}>
                  {p.booked}
                </td>
                <td role={R.cell} data-label={m.current} className={`${td} font-semibold tnum`}>
                  {p.current}
                </td>
                <td role={R.cell} data-label={m.allocation} className={`${td} tnum`}>
                  {p.alloc}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

export function TerminalRecord({ result, full, onReset }: { readonly result: TerminalResult; readonly full: boolean; readonly onReset: () => void }) {
  const m = messages.check.result;
  return (
    <div data-testid="terminal-result" data-kind={result.kind} className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <SheetTag variant="accent" wrap>
          {result.statusShort}
        </SheetTag>
        {result.sample ? <SampleTag /> : null}
        <span className="ml-auto text-label leading-normal text-ink-1/70 tnum">{result.pnrLabel}</span>
      </div>
      <p className="m-0 font-display status-fit font-semibold uppercase tracking-display">{result.statusBig}</p>
      <p className="m-0 text-sm text-ink-1/78">{result.statusLong}</p>
      {full && result.facts.length > 0 ? <FactsFrame facts={result.facts} pax={result.pax} /> : null}
      <p className="m-0 text-label leading-normal text-ink-1/70">{result.provenance}</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Button variant="ghost" onClick={onReset}>
          {m.another}
        </Button>
        {result.kind === "ok" ? (
          <Link href={pnrHref(result.pnr)} className="tap-44 font-display text-label font-semibold uppercase leading-normal tracking-caps no-underline">
            {m.openRecord}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
