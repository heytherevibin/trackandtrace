"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { TERMINAL_ID } from "@/components/shell/nav-config";
import { Plate } from "@/components/ui/plate";
import { Button } from "@/components/ui/button";
import { messages } from "@/messages";
import { fetchPnr } from "@/services/pnr-source";
import { recentStore } from "@/services/stores/recent-store";
import type { PnrOutcome } from "@/types/domain";
import { cn } from "@/utils/cn";
import { formatPnr } from "@/utils/pnr";
import { Perforation, PnrField, PnrStub, useShake } from "./pnr-field";
import { TerminalRecord } from "./pnr-terminal-result";
import { MIN_RUNNING_MS, fieldStatus, terminalResult, type TerminalResult } from "./pnr-terminal-state";
import { PlateMorph } from "./plate-morph";
import { RecentChecks, SamplePnrs } from "./recent-checks";

// The live check plate on the landing sheet. Run makes one real request through
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

function useCheckPlate(sampleMode: boolean, connected: boolean) {
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

  const digitsRef = useRef(digits);
  digitsRef.current = digits;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const run = () => runWith(digits);

  async function runWith(pnr: string) {
    if (phaseRef.current === "running") return;
    if (pnr.length !== 10) {
      setAttempted(true);
      shake();
      return;
    }
    const id = runId.current + 1;
    runId.current = id;
    const attemptedAt = new Date();
    phaseRef.current = "running";
    setPhase("running");
    setAnnouncement("");
    const [outcome] = await Promise.all([request(pnr), wait(MIN_RUNNING_MS)]);
    if (runId.current !== id) return;
    const view = terminalResult(outcome, { pnr, attemptedAt, sampleMode, connected });
    recentStore.push(view.recent);
    setResult(view);
    setPhase("done");
    setAnnouncement(messages.check.result.announce(view.statusShort, formatPnr(pnr)));
  }

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
    /** Run again with the same digits (a failure's Try again). */
    retry: () => {
      setPhase("entry");
      setResult(null);
      window.setTimeout(() => void runWith(digitsRef.current), 0);
    },
    /** Back to the entry with the digits kept (a no-record answer's Edit the digits). */
    edit: () => {
      focusPending.current = true;
      setPhase("entry");
      setResult(null);
    },
    /** Put a PNR in and run it at once (a sample chip). */
    runNow: (next: string) => {
      load(next);
      window.setTimeout(() => void runWith(next), 0);
    },
  };
}

const PHONE = "(max-width: 39.99rem)";
function subscribePhone(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const isPhone = () => window.matchMedia(PHONE).matches;
const notPhone = () => false;

/** Below 640px, while the PNR field has focus: Run pinned above the keyboard, the tab bar stepping aside (v4 .runbar).
 *  Rendered on a phone only, so nothing else ever reads its copy of the counter. */
function RunBar({ shown: wanted, counter, running, onRun }: { readonly shown: boolean; readonly counter: string; readonly running: boolean; readonly onRun: () => void }) {
  const phone = useSyncExternalStore(subscribePhone, isPhone, notPhone);
  const shown = wanted && phone;
  useEffect(() => {
    const root = document.documentElement;
    if (shown) root.dataset.runbar = "";
    else delete root.dataset.runbar;
    return () => {
      delete root.dataset.runbar;
    };
  }, [shown]);
  if (!shown) return null;
  return (
    <div aria-hidden="true" className="fixed bottom-0 left-0 z-nav flex w-screen items-center gap-3 border-t-2 border-edge bg-canvas px-3 pb-[calc(12px+var(--safe-bottom))] pt-3 sm:hidden">
      <span className="legend flex-1 text-ink-2">{counter}</span>
      {/* Mouse-down, not click: the field keeps focus, so the keyboard stays up while the check runs. */}
      <Button variant="primary" tabIndex={-1} onMouseDown={(event) => event.preventDefault()} onClick={onRun} className="min-w-35">
        {running ? messages.check.submitting : messages.check.submit}
      </Button>
    </div>
  );
}

/**
 * The hero plate, as Neubrutal v4 draws it: "PNR check — live request · Form TL-01"; the entry, the perforation and the
 * stub, or the record in place; then the device's recent checks and, in sample mode only, the sample PNRs.
 * `onResult` tells the hero when a record came back, for the install plate (v4 shows it after a first good check).
 */
export function PnrTerminal({ sampleMode, connected = false, onResult }: { readonly sampleMode: boolean; readonly connected?: boolean; readonly onResult?: (ok: boolean) => void }) {
  const plate = useCheckPlate(sampleMode, connected);
  const [focused, setFocused] = useState(false);
  const m = messages.check;
  const done = plate.phase === "done" && plate.result !== null;
  useEffect(() => {
    if (done && plate.result) onResult?.(plate.result.kind === "ok");
  }, [done, plate.result, onResult]);
  return (
    <Plate
      as="div"
      id={TERMINAL_ID}
      data-testid="hero-instrument"
      title={m.plate.title}
      meta={[m.plate.form]}
      padding="sm"
      bodyClassName="max-sm:p-3"
      className={cn("scroll-mt-[140px]", plate.shaking && "shake")}
      onAnimationEnd={plate.onAnimationEnd}
    >
      <PlateMorph face={done ? "record" : "entry"}>
        {!done || !plate.result ? (
          <div onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
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
            <Perforation />
            <PnrStub status={plate.status} showClear={plate.digits.length > 0 && plate.phase !== "running"} onClear={plate.clear} onRun={plate.run} />
          </div>
        ) : (
          <TerminalRecord result={plate.result} onReset={plate.reset} onRetry={plate.retry} onEdit={plate.edit} />
        )}
      </PlateMorph>
      <RecentChecks onPick={(pnr) => plate.load(pnr)} />
      {sampleMode ? <SamplePnrs onPick={plate.runNow} /> : null}
      <RunBar shown={focused && !done} counter={m.counter(plate.digits.length)} running={plate.phase === "running"} onRun={plate.run} />
      <p className="sr-only" aria-live="polite">
        {plate.announcement}
      </p>
    </Plate>
  );
}
