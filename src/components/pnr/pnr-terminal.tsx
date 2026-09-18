"use client";

import { useEffect, useRef, useState } from "react";
import { TERMINAL_ID } from "@/components/shell/nav-config";
import { Plate } from "@/components/ui/plate";
import { SweepBar } from "@/components/ui/sweep-bar";
import { messages } from "@/messages";
import { fetchPnr } from "@/services/pnr-source";
import { recentStore } from "@/services/stores/recent-store";
import type { PnrOutcome } from "@/types/domain";
import { cn } from "@/utils/cn";
import { formatPnr } from "@/utils/pnr";
import { PnrActions, PnrCells, PnrEntry, PnrField, PnrHint, PnrInput, PnrStub, useShake } from "./pnr-field";
import { TerminalRecord } from "./pnr-terminal-result";
import { MIN_RUNNING_MS, fieldStatus, terminalResult, type TerminalResult } from "./pnr-terminal-state";
import { RecentChecks } from "./recent-checks";

// The live check plates on the landing sheet. Run makes one real request through
// the PNR API (never a local port of the fixture), holds the running state long
// enough to read, and renders what came back in place.

type Phase = "entry" | "running" | "done";

const SILENT: PnrOutcome = { ok: false, code: "SOURCE_UNAVAILABLE", message: "The service could not be reached. No result was generated." };

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function request(pnr: string): Promise<PnrOutcome> {
  try {
    return (await fetchPnr(pnr)).outcome;
  } catch {
    return SILENT;
  }
}

function useCheckPlate(sampleMode: boolean, thirdPartyMode: boolean) {
  const [digits, setDigits] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [phase, setPhase] = useState<Phase>("entry");
  const [result, setResult] = useState<TerminalResult | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const runId = useRef(0);
  const focusPending = useRef(false);
  const { shaking, shake, onAnimationEnd } = useShake();

  useEffect(() => {
    const current = runId;
    return () => {
      current.current += 1;
    };
  }, []);

  // "Check another PNR" returns the caret to the entry block once it is back on the plate.
  useEffect(() => {
    if (!focusPending.current || !inputRef.current) return;
    focusPending.current = false;
    inputRef.current.focus();
  });

  const status = fieldStatus({ digits, attempted, running: phase === "running" });
  const focus = () => inputRef.current?.focus();

  const run = async () => {
    if (phase !== "entry") return;
    if (digits.length !== 10) {
      setAttempted(true);
      shake();
      return;
    }
    const pnr = digits;
    const id = runId.current + 1;
    runId.current = id;
    const attemptedAt = new Date();
    setPhase("running");
    setAnnouncement("");
    const [outcome] = await Promise.all([request(pnr), wait(MIN_RUNNING_MS)]);
    if (runId.current !== id) return;
    const view = terminalResult(outcome, { pnr, attemptedAt, sampleMode, thirdPartyMode });
    recentStore.push(view.recent);
    setResult(view);
    setPhase("done");
    setAnnouncement(messages.check.result.announce(view.statusShort, formatPnr(pnr)));
  };

  const load = (next: string) => {
    setDigits(next);
    setAttempted(false);
    setPhase("entry");
    setResult(null);
  };

  return {
    digits,
    status,
    phase,
    result,
    announcement,
    inputRef,
    shaking,
    onAnimationEnd,
    focus,
    run: () => void run(),
    type: (next: string) => {
      setDigits(next);
      setAttempted(false);
    },
    clear: () => {
      load("");
      focus();
    },
    reset: () => {
      focusPending.current = true;
      load("");
    },
    load,
  };
}

/** The hero plate: "PNR check — live request · Form T&T-01", with the recent strip along its foot. */
export function PnrTerminal({ sampleMode, thirdPartyMode = false }: { readonly sampleMode: boolean; readonly thirdPartyMode?: boolean }) {
  const plate = useCheckPlate(sampleMode, thirdPartyMode);
  const m = messages.check;
  return (
    <Plate
      as="div"
      id={TERMINAL_ID}
      data-testid="hero-instrument"
      title={m.plate.title}
      meta={[m.plate.form]}
      padding="md"
      className={cn("bg-surface-0", plate.shaking && "shake")}
      onAnimationEnd={plate.onAnimationEnd}
    >
      {plate.phase !== "done" || !plate.result ? (
        <>
          <PnrField
            id="pnr-a"
            digits={plate.digits}
            status={plate.status}
            sampleMode={sampleMode}
            onDigits={plate.type}
            onEnter={plate.run}
            inputRef={plate.inputRef}
            onActivate={plate.focus}
          />
          <div aria-hidden="true" className="perforation -mx-5 my-[18px]" />
          <PnrStub status={plate.status} showClear={plate.digits.length > 0 && plate.phase !== "running"} onClear={plate.clear} onRun={plate.run} />
        </>
      ) : (
        <TerminalRecord result={plate.result} full onReset={plate.reset} />
      )}
      <RecentChecks
        onPick={(pnr) => {
          plate.load(pnr);
        }}
      />
      <p className="sr-only" aria-live="polite">
        {plate.announcement}
      </p>
    </Plate>
  );
}

/** The closing plate: a second, compact check with the lead line above the cells and the hint beside Run. */
export function PnrClosingTerminal({
  sampleMode,
  thirdPartyMode = false,
  title,
  meta,
  lead,
}: {
  readonly sampleMode: boolean;
  readonly thirdPartyMode?: boolean;
  readonly title: string;
  readonly meta: string;
  readonly lead: string;
}) {
  const plate = useCheckPlate(sampleMode, thirdPartyMode);
  const running = plate.phase === "running";
  return (
    <Plate as="div" title={title} meta={[meta]} cells="wide" padding="lg" className={cn(plate.shaking && "shake")} onAnimationEnd={plate.onAnimationEnd}>
      {plate.phase !== "done" || !plate.result ? (
        <>
          <p className="mb-4 text-body leading-normal text-ink-1/78">{lead}</p>
          <PnrEntry className="max-w-[640px]">
            <PnrInput id="pnr-b" ariaLabel={messages.check.label} digits={plate.digits} status={plate.status} onDigits={plate.type} onEnter={plate.run} inputRef={plate.inputRef} />
            <PnrCells digits={plate.digits} status={plate.status} onActivate={plate.focus} />
          </PnrEntry>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <PnrHint inputId="pnr-b" digits={plate.digits} status={plate.status} sampleMode={sampleMode} className="min-w-0 flex-1 leading-normal" />
            <PnrActions running={running} showClear={plate.digits.length > 0 && !running} onClear={plate.clear} onRun={plate.run} />
          </div>
          {running ? <SweepBar className="mt-3.5" /> : null}
        </>
      ) : (
        <TerminalRecord result={plate.result} full={false} onReset={plate.reset} />
      )}
      <p className="sr-only" aria-live="polite">
        {plate.announcement}
      </p>
    </Plate>
  );
}
