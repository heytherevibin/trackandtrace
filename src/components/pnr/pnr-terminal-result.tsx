"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { messages } from "@/messages";
import type { PaxRow, TerminalFact, TerminalResult } from "./pnr-terminal-state";
import { SampleTag, SheetTag, ThirdPartyTag } from "./pnr-terminal-tags";

// The record rendered in place on the check plate, as drawn: status tag, sample
// tag, PNR; the big status; its description; the framed fact grid and the
// passenger table (hero plate only); provenance; "Check another PNR".

const LEGEND_11 = "font-display text-2xs font-semibold uppercase leading-normal tracking-caps text-ink-1/70";
const TH = `border-b border-line px-3.5 py-2 text-left ${LEGEND_11}`;
const TD = "border-b border-line px-3.5 py-2";

function FactsFrame({ facts, pax }: { readonly facts: readonly TerminalFact[]; readonly pax: readonly PaxRow[] }) {
  const m = messages.check.result.passengers;
  return (
    <div className="border border-line">
      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))]">
        {facts.map((f) => (
          <div key={f.label} className="-mt-px border-t border-line px-3.5 py-2.5">
            <dt className={LEGEND_11}>{f.label}</dt>
            <dd className="m-0 font-data text-lead leading-normal tracking-head">{f.value}</dd>
          </div>
        ))}
      </dl>
      {pax.length > 0 ? (
        <table className="w-full border-collapse border-t border-line text-sm leading-normal">
          <caption className="sr-only">{m.caption}</caption>
          <thead>
            <tr>
              <th scope="col" className={TH}>
                {m.passenger}
              </th>
              <th scope="col" className={TH}>
                {m.booked}
              </th>
              <th scope="col" className={TH}>
                {m.current}
              </th>
              <th scope="col" className={TH}>
                {m.allocation}
              </th>
            </tr>
          </thead>
          <tbody>
            {pax.map((p) => (
              <tr key={p.key} className="hover:bg-ink-1/4">
                <td className={TD}>{p.name}</td>
                <td className={`${TD} text-ink-1/70 tnum`}>{p.booked}</td>
                <td className={`${TD} font-semibold tnum`}>{p.current}</td>
                <td className={`${TD} tnum`}>{p.alloc}</td>
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
        <SheetTag variant="accent">{result.statusShort}</SheetTag>
        {result.sample ? <SampleTag /> : null}
        {result.thirdParty ? <ThirdPartyTag source={result.thirdParty} /> : null}
        <span className="ml-auto text-label leading-normal text-ink-1/70 tnum">{result.pnrLabel}</span>
      </div>
      <p className="m-0 font-display text-4xl font-semibold uppercase tracking-display">{result.statusBig}</p>
      <p className="m-0 text-sm text-ink-1/78">{result.statusLong}</p>
      {full && result.facts.length > 0 ? <FactsFrame facts={result.facts} pax={result.pax} /> : null}
      <p className="m-0 text-label leading-normal text-ink-1/70">{result.provenance}</p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <Button variant="ghost" onClick={onReset}>
          {m.another}
        </Button>
        {result.kind === "ok" ? (
          <Link href={`/pnr/${result.pnr}`} className="font-display text-label font-semibold uppercase leading-normal tracking-caps no-underline">
            {m.openRecord}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
