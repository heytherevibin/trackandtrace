"use client";

import { useCallback, useEffect, useState, type AnimationEvent, type ClipboardEvent, type KeyboardEvent, type ReactNode, type Ref, type SyntheticEvent } from "react";
import { Button } from "@/components/ui/button";
import { Led } from "@/components/ui/led";
import { messages } from "@/messages";
import { cn } from "@/utils/cn";
import { formatPnr, normalizePnr, pnrInText } from "@/utils/pnr";
import { caretIndex, hintFor, lampFor, type FieldStatus } from "./pnr-terminal-state";

// The entry block of the check plate, as Neubrutal v4 draws it (Form TL-01): "PNR number" and its "N / 10" counter,
// then ten keys punched 3-3-4 — paper keys with a hard shadow, a filled key pressed in blue, the caret key yellow, an
// empty key red-edged when the digits are refused — with each group's legend under it. The one real input lies
// transparent over the keys, so a click, tap, right-click or long-press lands on a genuine text field (with the
// browser's own Paste), while the keys draw what it holds.

const GROUPS = [
  { keys: [0, 1, 2], label: messages.check.groups.one, flex: "flex-[3_1_0%]" },
  { keys: [3, 4, 5], label: messages.check.groups.two, flex: "flex-[3_1_0%]" },
  { keys: [6, 7, 8, 9], label: messages.check.groups.three, flex: "flex-[4_1_0%]" },
] as const;

const CELL =
  "relative flex h-14 min-w-0 flex-1 items-center justify-center rounded-control border-2 border-edge bg-paper shadow-control transition-[transform,box-shadow,background-color] duration-100 max-sm:h-11";
const CELL_FILLED = "translate-x-[3px] translate-y-[3px] bg-blue shadow-pressed nb-pop";
const CELL_CARET = "bg-accent";

export function hintIdFor(inputId: string): string {
  return `${inputId}-hint`;
}

/** The face of the input: decorative cells; a click anywhere focuses the real input. No outline around the
 *  row: the caret cell (steel edge, blinking caret) shows where typing lands. */
export function PnrCells({ digits, status, onActivate, className }: { readonly digits: string; readonly status: FieldStatus; readonly onActivate: () => void; readonly className?: string }) {
  const caret = caretIndex(digits, status);
  const refused = status === "invalid";
  return (
    // Padded by the keys' 3px shadow, so the last key's shadow is never cut by the plate.
    <div aria-hidden="true" onClick={onActivate} className={cn("flex cursor-text items-end pb-[3px] pr-[3px]", className)}>
      {GROUPS.map((group, gi) => (
        <div key={group.label} className={cn("flex min-w-0 flex-col", group.flex, gi > 0 && "ml-3")}>
          <div className="flex gap-1.5">
            {group.keys.map((k) => {
              const digit = digits[k] ?? "";
              const filled = digit !== "";
              const here = caret === k;
              return (
                <span
                  key={k}
                  data-cell={k + 1}
                  data-filled={filled || undefined}
                  data-caret={here || undefined}
                  data-invalid={(refused && !filled) || undefined}
                  className={cn(CELL, filled && CELL_FILLED, here && CELL_CARET, refused && !filled && "border-red")}
                >
                  <span className={cn("font-display text-2xl leading-none max-sm:text-xl", filled ? "text-on-blue" : here ? "text-on-fill" : "text-ink-1")}>{digit}</span>
                  {here ? <span className="caret-blink absolute bottom-2 left-1/4 right-1/4 h-[3px] bg-on-fill" /> : null}
                </span>
              );
            })}
          </div>
          <span className="legend mt-2 text-center">{group.label}</span>
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

/**
 * The cells draw digits filling from the left with the caret after the last one, so the real
 * caret is held to match: at the end, or around everything (select all, then type or paste over).
 */
function holdCaretAtEnd(event: SyntheticEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  const end = input.value.length;
  const { selectionStart: start, selectionEnd: stop } = input;
  if (start === null || stop === null) return;
  if ((start === end && stop === end) || (start === 0 && stop === end)) return;
  input.setSelectionRange(end, end);
}

/**
 * The one real input: transparent over the cells, numeric, formatted 3-3-4, Enter runs the check.
 * A paste is read whole before anything is inserted (no character cap to cut it short): a PNR
 * found in the text replaces the entry; other digits follow the ones already typed.
 */
export function PnrInput({ id, digits, status, onDigits, onEnter, ariaLabel, inputRef, autoFocus }: PnrInputProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    onEnter();
  };
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    if (status === "running") return;
    const text = event.clipboardData.getData("text");
    const whole = pnrInText(text);
    if (whole) {
      onDigits(whole);
      return;
    }
    const pasted = normalizePnr(text);
    if (pasted.length === 0) return;
    const input = event.currentTarget;
    const everything = input.value.length > 0 && input.selectionStart === 0 && input.selectionEnd === input.value.length;
    onDigits(normalizePnr(everything ? pasted : digits + pasted));
  };
  return (
    <input
      ref={inputRef}
      id={id}
      name="pnr"
      className="absolute inset-0 z-10 m-0 size-full cursor-text appearance-none border-0 bg-transparent p-0 text-base opacity-0"
      inputMode="numeric"
      enterKeyHint="go"
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      value={formatPnr(digits)}
      readOnly={status === "running"}
      onChange={(event) => onDigits(normalizePnr(event.target.value))}
      onPaste={onPaste}
      onSelect={holdCaretAtEnd}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
      aria-invalid={status === "invalid" || undefined}
      aria-describedby={hintIdFor(id)}
      autoFocus={autoFocus}
    />
  );
}

/** Stacks the real input over the drawn cells so every pointer gesture on the cells reaches it. */
export function PnrEntry({ className, children }: { readonly className?: string; readonly children: ReactNode }) {
  return <div className={cn("relative", className)}>{children}</div>;
}

/** The hint line: an alert when the digits are refused, a polite live line otherwise. */
export function PnrHint({ inputId, digits, status, sampleMode, className }: { readonly inputId: string; readonly digits: string; readonly status: FieldStatus; readonly sampleMode: boolean; readonly className?: string }) {
  const invalid = status === "invalid";
  return (
    <p id={hintIdFor(inputId)} role={invalid ? "alert" : undefined} aria-live={invalid ? undefined : "polite"} className={cn("m-0 text-sm leading-5", invalid ? "text-red" : "text-ink-2", className)}>
      {hintFor(status, digits)}
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
    <div className="flex flex-col">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="font-structure text-sm font-bold uppercase leading-5 tracking-wide text-ink-1">
          {messages.check.label}
        </label>
        <span className="font-figure text-xs leading-4 text-ink-3 tnum">{messages.check.counter(digits.length)}</span>
      </div>
      <PnrEntry>
        <PnrInput id={id} digits={digits} status={status} {...input} />
        <PnrCells digits={digits} status={status} onActivate={onActivate ?? (() => document.getElementById(id)?.focus())} />
      </PnrEntry>
      <PnrHint inputId={id} digits={digits} status={status} sampleMode={sampleMode} className="mt-3" />
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
      <Button type={runType} variant="primary" onClick={onRun} aria-busy={running || undefined} className="min-w-[min(8rem,100%)] max-sm:w-full">
        {running ? m.submitting : m.submit}
      </Button>
    </>
  );
}

/** The ticket's tear line (v4): a dashed rule across the plate, with a punched notch at each end. */
export function Perforation() {
  return (
    // Out to the plate's edges: its padding (16px, 12px on a phone) and its 2px border, so the notches sit on the edge.
    <div aria-hidden="true" className="relative -mx-[18px] my-4 h-0 border-t-2 border-dashed border-edge max-sm:-mx-[14px]">
      {/* In px, as the tear line's own reach is: they sit on the plate's edge whatever the text size. */}
      <span className="absolute -left-[10px] -top-[10px] size-[16px] rounded-full border-2 border-edge bg-canvas" />
      <span className="absolute -right-[10px] -top-[10px] size-[16px] rounded-full border-2 border-edge bg-canvas" />
    </div>
  );
}

const STEP_WIDTH = ["w-1/5", "w-3/5", "w-[92%]"] as const;
const STEPS = [messages.check.steps.validate, messages.check.steps.source, messages.check.steps.result] as const;

/** v4's running request: a striped bar that steps across, and the three stops lit as it passes them. */
export function RunSteps() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const one = window.setTimeout(() => setStep(1), 250);
    const two = window.setTimeout(() => setStep(2), 700);
    return () => {
      window.clearTimeout(one);
      window.clearTimeout(two);
    };
  }, []);
  return (
    <div aria-hidden="true">
      <div className="mt-4 h-3 overflow-hidden rounded-control border-2 border-edge bg-paper">
        <div className={cn("nb-stripes h-full transition-[width] duration-300 ease-out", STEP_WIDTH[step])} />
      </div>
      <ol className="m-0 mt-3 flex list-none flex-wrap gap-x-5 gap-y-2 p-0">
        {STEPS.map((label, i) => (
          <li key={label} className="legend flex items-center gap-2 text-ink-2">
            <span className={cn("size-2 rounded-full border-2 border-edge", i < step ? "bg-lime" : i === step ? "nb-blink bg-orange" : "bg-transparent")} />
            {label}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The ticket stub under the perforation: the lamp and its label, Clear, Run, and the steps while running. */
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
        <span className="inline-flex min-w-[min(10rem,100%)] flex-1 items-center gap-2.5">
          <Led lit={lamp.state === "lit"} busy={lamp.state === "busy"} alert={lamp.state === "alert"} />
          <span className="legend text-ink-2">{lamp.label}</span>
        </span>
        <PnrActions running={running} showClear={showClear} onClear={onClear} onRun={onRun} runType={runType} />
      </div>
      {running ? <RunSteps /> : null}
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
