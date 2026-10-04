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
// beneath, side by side where each has 5rem. useOutgrown measures the table itself and holds no width of its own; as
// drawn, the frame is the window less 84px on a phone, so the record stacks in every window under 394px (every phone)
// and is the table from there up.
const STACKED_ROW = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,5rem),1fr))] gap-x-4 gap-y-2 border-b border-line px-3.5 py-2.5 last:border-b-0";
const STACKED_CELL = "min-w-0 wrap-break-word before:mb-0.5 before:block before:legend-sm before:text-ink-1/70 before:content-[attr(data-label)_/_'']";

function FactsFrame({ facts, pax }: { readonly facts: readonly TerminalFact[]; readonly pax: readonly PaxRow[] }) {
  const m = messages.check.result.passengers;
  const [frame, stacked] = useOutgrown<HTMLDivElement>();
  const td = stacked ? STACKED_CELL : TD;
  return (
    <div ref={frame} className="border border-line">
      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,6.875rem),1fr))]">
        {facts.map((f) => (
          <div key={f.label} className="-mt-px border-t border-line px-3.5 py-2.5">
            <dt className={LEGEND_11}>{f.label}</dt>
            <dd className="m-0 font-data text-lead leading-normal tracking-head">{f.value}</dd>
          </div>
        ))}
      </dl>
      {pax.length > 0 ? (
        <table role={R.table} data-stacked={stacked || undefined} className={cn("w-full border-collapse border-t border-line text-sm leading-normal", stacked && "block")}>
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
