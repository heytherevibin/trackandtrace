"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, buttonClassName } from "@/components/ui/button";
import { messages } from "@/messages";
import type { PnrResult } from "@/types/domain";
import { cn } from "@/utils/cn";
import { pnrHref } from "@/utils/pnr";
import { nextForFailure, nextForResult, type FailureKind, type NextAction } from "./next-action";
import type { PaxRow, TerminalFact, TerminalResult } from "./pnr-terminal-state";
import { SampleTag } from "./pnr-terminal-tags";
import { useSaveAndShare } from "./use-save-share";

// The record in place on the check plate, as Neubrutal v4 draws it (.result-stack): the tag row; the big status and
// what it means; the route; the Next box, one instruction with the chart countdown; the eight facts and the passengers
// in one frame (or, for a failure, what came back, from where, and that nothing stood in); the provenance; then Save,
// Share, the full record, and Check another PNR. Each piece rises in turn (nb-rise).

/** The time now, a minute at a time, after mount: the countdown is drawn on the client so server and client agree. */
function useMinute(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** The status lamp's colour: lime confirmed, orange still waiting, red cancelled, dropped or failed, grey no record. */
function toneOf(result: TerminalResult, next: NextAction | null): string {
  if (result.kind === "notfound") return "bg-ink-3";
  if (result.kind !== "ok" || !result.record) return "bg-red";
  if (next?.quiet) return "bg-red";
  return result.record.lead.status === "CNF" ? "bg-lime" : "bg-orange";
}

export function ResultTags({ result, next }: { readonly result: TerminalResult; readonly next: NextAction | null }) {
  const fill = result.kind === "ok" && !next?.quiet;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cn("inline-flex min-h-7 items-center gap-2 rounded-control border-2 border-edge px-2.5 font-figure text-xs uppercase tracking-wide max-sm:min-h-6.5", fill ? "bg-pink text-on-fill" : "bg-paper text-ink-1")}>
        <span aria-hidden="true" className={cn("size-2 rounded-full border-2 border-edge", toneOf(result, next))} />
        {result.statusShort}
      </span>
      {result.sample ? <SampleTag /> : null}
      <span className="ml-auto font-figure text-xs leading-4 text-ink-3 tnum">{result.pnrLabel}</span>
    </div>
  );
}

export function NextBox({ next }: { readonly next: { readonly head: string; readonly text: string; readonly big?: string | null; readonly quiet?: boolean } }) {
  return (
    <div className={cn("next grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-control border-2 border-edge px-4 py-3 shadow-control max-sm:grid-cols-1", next.quiet ? "bg-paper text-ink-1" : "bg-accent text-on-fill")}>
      <span className="legend col-span-full text-current">{next.head}</span>
      <p className="m-0 max-w-none text-sm font-medium leading-5">{next.text}</p>
      {next.big ? <span className="nb-wipe whitespace-nowrap font-display text-3xl leading-8 max-sm:text-2xl max-sm:leading-7">{next.big}</span> : null}
    </div>
  );
}

// minmax(0, …): a track never grows past its share for its words, which wrap inside it (text made larger).
const PAX_GRID =
  "grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)] items-baseline gap-3 px-4 py-3 text-sm leading-5 max-sm:grid-cols-[repeat(2,minmax(0,1fr))] max-sm:gap-y-2";

/** v4's passenger rows (.pax): four columns, folding into labelled pairs under 640px. */
export function PassengerRows({ pax }: { readonly pax: readonly PaxRow[] }) {
  const m = messages.check.result.passengers;
  const label = "legend hidden max-sm:block";
  return (
    <div role="table" aria-label={m.caption}>
      <div role="row" className={cn(PAX_GRID, "legend border-b-2 border-edge py-2 max-sm:hidden")}>
        <span role="columnheader" className="min-w-0 wrap-anywhere">{m.passenger}</span>
        <span role="columnheader" className="min-w-0 wrap-anywhere">{m.booked}</span>
        <span role="columnheader" className="min-w-0 wrap-anywhere">{m.current}</span>
        <span role="columnheader" className="min-w-0 wrap-anywhere">{m.allocation}</span>
      </div>
      {pax.map((p, i) => (
        <div key={p.key} role="row" className={cn(PAX_GRID, i > 0 && "border-t-2 border-edge")}>
          <span role="cell" className="min-w-0 font-semibold wrap-anywhere max-sm:col-span-full">
            {p.name}
          </span>
          <span role="cell" className="min-w-0 font-figure text-ink-3 tnum wrap-anywhere">
            <span className={label}>{m.booked}</span>
            {p.booked}
          </span>
          <span role="cell" className="min-w-0 font-figure font-bold tnum wrap-anywhere">
            <span className={label}>{m.current}</span>
            {p.current}
          </span>
          <span role="cell" className="min-w-0 font-figure tnum wrap-anywhere">
            <span className={label}>{m.allocation}</span>
            {p.alloc}
          </span>
        </div>
      ))}
    </div>
  );
}

function FactsFrame({ facts, pax }: { readonly facts: readonly TerminalFact[]; readonly pax: readonly PaxRow[] }) {
  return (
    <div className="overflow-hidden rounded-control border-2 border-edge bg-paper">
      <dl className="m-0 grid grid-cols-[repeat(auto-fit,minmax(min(100%,176px),1fr))] max-sm:grid-cols-2">
        {facts.map((f, i) => (
          <div key={f.label} className={cn("-mt-0.5 min-w-0 border-t-2 border-edge px-4 py-3", "max-sm:mt-0 max-sm:border-t-0", i >= 2 && "max-sm:border-t-2", i % 2 === 1 && "max-sm:border-l-2")}>
            <dt className="legend">{f.label}</dt>
            <dd className="m-0 mt-1 font-figure text-sm leading-5 wrap-anywhere">{f.value}</dd>
          </div>
        ))}
      </dl>
      {pax.length > 0 ? (
        <div className="border-t-2 border-edge">
          <PassengerRows pax={pax} />
        </div>
      ) : null}
    </div>
  );
}

function FailureFrame({ response }: { readonly response: string }) {
  const f = messages.check.result.failure;
  const cells = [
    { label: f.response, value: response },
    { label: f.provenance, value: f.none },
    { label: f.fallback, value: f.notUsed },
  ];
  return (
    <dl className="m-0 grid grid-cols-3 overflow-hidden rounded-control border-2 border-edge bg-paper max-sm:grid-cols-1">
      {cells.map((c, i) => (
        <div key={c.label} className={cn("min-w-0 px-4 py-3", i > 0 && "border-l-2 border-edge max-sm:border-l-0 max-sm:border-t-2")}>
          <dt className="legend">{c.label}</dt>
          <dd className="m-0 mt-1 font-figure text-base leading-6">{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function RecordActions({ pnr, record }: { readonly pnr: string; readonly record: PnrResult }) {
  const m = messages.result.actions;
  const { saved, saving, copied, signedIn, toggleSave, share } = useSaveAndShare(pnr, record);
  return (
    <>
      <Button variant={saved ? "secondary" : "primary"} onClick={toggleSave} loading={saving} aria-pressed={saved} data-testid="save-watchlist" className="max-sm:col-span-full">
        {saved ? (signedIn ? m.savedToAccount : m.savedOnDevice) : m.save}
      </Button>
      <Button variant="secondary" onClick={share} data-testid="share-result">
        {copied ? m.copied : m.shareLink}
      </Button>
      <Link href={pnrHref(pnr)} className={buttonClassName({ variant: "ghost" })}>
        {messages.check.result.openRecord}
      </Link>
    </>
  );
}

/** The record in place. `onRetry` re-runs the check; `onEdit` returns to the entry with the digits kept. */
export function TerminalRecord({ result, onReset, onRetry, onEdit }: { readonly result: TerminalResult; readonly onReset: () => void; readonly onRetry: () => void; readonly onEdit: () => void }) {
  const m = messages.check.result;
  const now = useMinute();
  const ok = result.kind === "ok" && result.record !== null;
  const next = ok && result.record && now ? nextForResult(result.record, now) : null;
  const failure: FailureKind | null = ok ? null : result.kind === "ok" ? "unavailable" : result.kind;
  const box = next ?? (failure ? { head: messages.check.next.head.next, text: nextForFailure(failure, result.retryAfter) } : null);
  return (
    <div data-testid="terminal-result" data-kind={result.kind} className="result-stack flex flex-col gap-4">
      <ResultTags result={result} next={next} />
      <div>
        <h2 className="nb-status m-0">{result.statusBig}</h2>
        <p className="m-0 mt-2 text-sm leading-5 text-ink-2">{next?.long ?? result.statusLong}</p>
      </div>
      {ok && result.routeNames ? <p className="m-0 -mt-2 text-sm leading-5 text-ink-2">{result.routeNames}</p> : null}
      {box ? <NextBox next={box} /> : null}
      {ok ? <FactsFrame facts={result.facts} pax={result.pax} /> : result.failResponse ? <FailureFrame response={result.failResponse} /> : null}
      <p className="m-0 font-figure text-xs leading-4 text-ink-3">{result.provenance}</p>
      <div className="flex flex-wrap items-center gap-2 max-sm:grid max-sm:grid-cols-2">
        {ok && result.record ? <RecordActions pnr={result.pnr} record={result.record} /> : null}
        {!ok ? (
          <Button variant="primary" onClick={result.kind === "notfound" || result.kind === "refused" ? onEdit : onRetry} className="max-sm:col-span-full">
            {result.kind === "notfound" || result.kind === "refused" ? m.editDigits : m.tryAgain}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onReset} className="ml-auto max-sm:col-span-full max-sm:ml-0">
          {m.another}
        </Button>
      </div>
    </div>
  );
}
