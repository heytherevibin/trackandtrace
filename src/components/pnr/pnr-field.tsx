"use client";

import { useCallback, useState, type AnimationEvent, type KeyboardEvent, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { Led } from "@/components/ui/led";
import { SweepBar } from "@/components/ui/sweep-bar";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { formatPnr, normalizePnr } from "@/utils/pnr";
import { caretIndex, hintFor, lampFor, type FieldStatus } from "./pnr-terminal-state";

// The entry block of the check plate, as drawn: a steel legend and "N / 10"
// counter, one visually hidden input that carries the value, and its face —
// ten 52px cells punched 3-3-4 with a caret and the group rulers under them.

const GROUPS = [
  { keys: [0, 1, 2], label: messages.check.groups.one, flex: "flex-[3_1_0%]" },
  { keys: [3, 4, 5], label: messages.check.groups.two, flex: "flex-[3_1_0%]" },
  { keys: [6, 7, 8, 9], label: messages.check.groups.three, flex: "flex-[4_1_0%]" },
] as const;

const RULER_LABEL = "px-[3px] font-display text-2xs font-semibold leading-normal tracking-caps text-ink-1/70 tnum";

export function hintIdFor(inputId: string): string {
  return `${inputId}-hint`;
}

/** The face of the input: decorative cells; a click anywhere focuses the real input. No outline around the
 *  row: the caret cell (steel edge, blinking caret) shows where typing lands. */
export function PnrCells({ digits, status, onActivate, className }: { readonly digits: string; readonly status: FieldStatus; readonly onActivate: () => void; readonly className?: string }) {
  const caret = caretIndex(digits, status);
  return (
    <div
      aria-hidden="true"
      onClick={onActivate}
      className={cn("flex cursor-text items-end", className)}
    >
      {GROUPS.map((group, gi) => (
        <div key={group.label} className={cn("flex min-w-0 flex-col", group.flex, gi > 0 && "ml-3.5")}>
          <div className="flex gap-1">
            {group.keys.map((k) => {
              const digit = digits[k] ?? "";
              const here = caret === k;
              return (
                <span
                  key={k}
                  data-cell={k + 1}
                  data-filled={digit !== "" || undefined}
                  data-caret={here || undefined}
                  className={cn("relative flex h-[52px] min-w-0 flex-1 items-center justify-center border", here ? "border-accent" : "border-line", digit !== "" ? "bg-accent-wash" : "bg-transparent")}
                >
                  <span className="font-display text-3xl font-semibold leading-none text-ink-1">{digit}</span>
                  {here ? <span className="caret-blink absolute bottom-2 left-1/4 right-1/4 h-0.5 bg-accent" /> : null}
                </span>
              );
            })}
          </div>
          <div className="mt-1.5 flex items-center gap-1">
            <span className="h-[5px] w-px bg-line" />
            <span className="h-px flex-1 bg-line" />
            <span className={RULER_LABEL}>{group.label}</span>
            <span className="h-px flex-1 bg-line" />
            <span className="h-[5px] w-px bg-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface PnrInputProps {
  readonly id: string;
  readonly digits: string;
  readonly status: FieldStatus;
  readonly onDigits: (digits: string) => void;
  readonly onEnter: () => void;
  /** Set when no visible label is drawn (the closing plate). */
  readonly ariaLabel?: string;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly autoFocus?: boolean;
}

/** The one real input: visually hidden, numeric, formatted 3-3-4, Enter runs the check. */
export function PnrInput({ id, digits, status, onDigits, onEnter, ariaLabel, inputRef, autoFocus }: PnrInputProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    onEnter();
  };
  return (
    <input
      ref={inputRef}
      id={id}
      name="pnr"
      className="peer sr-only"
      inputMode="numeric"
      enterKeyHint="go"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      maxLength={12}
      value={formatPnr(digits)}
      readOnly={status === "running"}
      onChange={(event) => onDigits(normalizePnr(event.target.value))}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
      aria-invalid={status === "invalid" || undefined}
      aria-describedby={hintIdFor(id)}
      autoFocus={autoFocus}
    />
  );
}

/** The hint line: an alert when the digits are refused, a polite live line otherwise. */
export function PnrHint({ inputId, digits, status, sampleMode, className }: { readonly inputId: string; readonly digits: string; readonly status: FieldStatus; readonly sampleMode: boolean; readonly className?: string }) {
  const invalid = status === "invalid";
  return (
    <p id={hintIdFor(inputId)} role={invalid ? "alert" : undefined} aria-live={invalid ? undefined : "polite"} className={cn("m-0 text-sm", invalid ? "text-ink-alert" : "text-ink-1/74", className)}>
      {hintFor(status, digits, sampleMode)}
    </p>
  );
}

export interface PnrFieldProps extends Omit<PnrInputProps, "ariaLabel"> {
  readonly sampleMode: boolean;
  /** Focuses the real input; defaults to nothing when no ref is wired. */
  readonly onActivate?: () => void;
}

/** The hero entry block: legend and counter, the hidden input, the cells, the hint. */
export function PnrField({ id, digits, status, sampleMode, onActivate, ...input }: PnrFieldProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={id} className="font-display text-label font-semibold uppercase leading-normal tracking-caps text-accent-text">
          {messages.check.label}
        </label>
        <span className="text-label leading-normal text-ink-1/70 tnum">{messages.check.counter(digits.length)}</span>
      </div>
      <PnrInput id={id} digits={digits} status={status} {...input} />
      <PnrCells digits={digits} status={status} onActivate={onActivate ?? (() => document.getElementById(id)?.focus())} />
      <PnrHint inputId={id} digits={digits} status={status} sampleMode={sampleMode} className="leading-5" />
    </div>
  );
}

/** Clear (ghost) and Run (primary, 120px floor), as both plates draw them. */
export function PnrActions({
  running,
  showClear,
  onClear,
  onRun,
  runType = "button",
}: {
  readonly running: boolean;
  readonly showClear: boolean;
  readonly onClear: () => void;
  readonly onRun?: () => void;
  readonly runType?: "button" | "submit";
}) {
  const m = messages.check;
  return (
    <>
      {showClear ? (
        <Button variant="ghost" onClick={onClear}>
          {m.clear}
        </Button>
      ) : null}
      <Button type={runType} variant="primary" onClick={onRun} className="min-w-[120px]">
        {running ? m.submitting : m.submit}
      </Button>
    </>
  );
}

/** The ticket stub under the perforation: the lamp and its label, Clear, Run, and the sweep while running. */
export function PnrStub({
  status,
  showClear,
  onClear,
  onRun,
  runType = "button",
}: {
  readonly status: FieldStatus;
  readonly showClear: boolean;
  readonly onClear: () => void;
  readonly onRun?: () => void;
  readonly runType?: "button" | "submit";
}) {
  const lamp = lampFor(status);
  const running = status === "running";
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex min-w-[180px] flex-1 items-center gap-2.5">
          <Led lit={lamp.state === "lit"} busy={lamp.state === "busy"} />
          <span className="font-display text-label font-semibold uppercase leading-normal tracking-caps text-ink-1/70">{lamp.label}</span>
        </span>
        <PnrActions running={running} showClear={showClear} onClear={onClear} onRun={onRun} runType={runType} />
      </div>
      {running ? <SweepBar className="mt-3.5" /> : null}
    </>
  );
}

/** The invalid-entry shake: restartable, and cleared when the plate's own animation ends. */
export function useShake(): { readonly shaking: boolean; readonly shake: () => void; readonly onAnimationEnd: (event: AnimationEvent<HTMLElement>) => void } {
  const [shaking, setShaking] = useState(false);
  const shake = useCallback(() => {
    setShaking(false);
    const nextFrame = typeof window.requestAnimationFrame === "function" ? (fn: () => void) => window.requestAnimationFrame(fn) : (fn: () => void) => window.setTimeout(fn, 16);
    nextFrame(() => setShaking(true));
  }, []);
  const onAnimationEnd = useCallback((event: AnimationEvent<HTMLElement>) => {
    if (event.target === event.currentTarget) setShaking(false);
  }, []);
  return { shaking, shake, onAnimationEnd };
}
