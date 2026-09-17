"use client";

import { DismissRegular } from "@/components/icons";
import { useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { messages } from "@/messages";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Led } from "@/components/ui/led";
import { SegmentReadout } from "@/components/ui/segment-readout";
import type { Tone } from "@/types/ui";
import { cn } from "@/utils/cn";
import { formatPnr, normalizePnr } from "@/utils/pnr";

// The signature control, laid out like the hardware it quotes:
//   header strip — silkscreen label · stage lamps · segment readout
//   the row      — ten step keys (3-3-4), position numbers above, LED lens in
//                  each cap, bank rulers below
//   action strip — hint · clear · the RUN key
// One real input carries the value for assistive tech; the keys are its face.

export type PnrFieldStatus = "idle" | "partial" | "ready" | "invalid" | "running";
export type PnrStage = "input" | "validate" | "source" | "result";

const GROUPS = [
  { keys: [0, 1, 2], colour: "red", label: messages.check.groups.one },
  { keys: [3, 4, 5], colour: "orange", label: messages.check.groups.two },
  { keys: [6, 7, 8, 9], colour: "yellow", label: messages.check.groups.three },
] as const;

// Colour stays in a thin strip at the top of each cell; the cell itself is a quiet tile.
const STRIP: Record<"red" | "orange" | "yellow", string> = { red: "bg-key-red", orange: "bg-key-orange", yellow: "bg-key-yellow" };

const STAGE_INDEX: Record<PnrStage, number> = { input: 1, validate: 4, source: 7, result: 9 };

export interface PnrFieldProps {
  readonly value: string;
  readonly onChange: (digits: string) => void;
  readonly onSubmit?: () => void;
  readonly onClear?: () => void;
  readonly status: PnrFieldStatus;
  readonly stage?: PnrStage;
  readonly errorMessage?: string;
  readonly id?: string;
  readonly autoFocus?: boolean;
  readonly disabled?: boolean;
  readonly shakeToken?: number;
  readonly compact?: boolean;
}

function hintFor(status: PnrFieldStatus, digits: string, errorMessage?: string, stage?: PnrStage): string {
  switch (status) {
    case "idle":
      return messages.check.helper;
    case "partial":
      return messages.check.progress(digits.length);
    case "ready":
      return messages.check.ready;
    case "invalid":
      return errorMessage ?? messages.check.errorInvalid;
    case "running":
      return `${messages.check.submitting}: ${messages.check.stages[stage ?? "input"]}`;
  }
}

interface StageLamp {
  readonly label: string;
  readonly lit: boolean;
  readonly tone: Tone | "key";
}

function stageLamps(status: PnrFieldStatus, digitCount: number): readonly StageLamp[] {
  const s = messages.check.stages;
  return [
    { label: s.input, lit: digitCount > 0, tone: "go" },
    { label: s.validate, lit: status === "ready" || status === "invalid", tone: status === "invalid" ? "stop" : "go" },
    { label: s.source, lit: status === "running", tone: "watch" },
    { label: s.result, lit: false, tone: "neutral" },
  ];
}

export function PnrField({ value, onChange, onSubmit, onClear, status, stage, errorMessage, id, autoFocus, disabled, shakeToken = 0, compact = false }: PnrFieldProps) {
  const generated = useId();
  const inputId = id ?? `pnr-${generated}`;
  const hintId = `${inputId}-hint`;
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();
  const digits = normalizePnr(value);
  const caret = Math.min(digits.length, 9);
  const running = status === "running";

  // Chase light: sweeps the cap lenses in tempo while running; reduced motion parks it on the current stage.
  const [chase, setChase] = useState(0);
  useEffect(() => {
    if (!running || reduceMotion) return;
    const timer = window.setInterval(() => setChase((c) => (c + 1) % 10), 110);
    return () => window.clearInterval(timer);
  }, [running, reduceMotion]);

  const litIndex = running ? (reduceMotion ? STAGE_INDEX[stage ?? "input"] : chase) : status === "ready" ? -1 : caret;
  const allLit = status === "ready" && !running;

  // Derived shake: a new token starts the animation; animationend clears it.
  const [prevShakeToken, setPrevShakeToken] = useState(shakeToken);
  const [shaking, setShaking] = useState(false);
  if (shakeToken !== prevShakeToken) {
    setPrevShakeToken(shakeToken);
    setShaking(true);
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (status === "ready") onSubmit?.();
    }
  };

  return (
    <div className={cn("flex flex-col", compact ? "gap-4" : "gap-6", shaking && "shake")} data-status={status} onAnimationEnd={() => setShaking(false)}>
      {/* Header strip: label · stage lamps · readout */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <label htmlFor={inputId} className="silk">
          {messages.check.label}
        </label>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {!compact ? (
            <div className="hidden items-center gap-4 md:flex" aria-hidden="true">
              {stageLamps(status, digits.length).map((lamp) => (
                <span key={lamp.label} className="flex items-center gap-1.5">
                  <Led tone={lamp.tone} lit={lamp.lit} size="sm" />
                  <span className="silk text-ink-3">{lamp.label}</span>
                </span>
              ))}
            </div>
          ) : null}
          <SegmentReadout value={digits.length > 0 ? formatPnr(digits) : "- - -"} label={messages.check.readoutLabel(formatPnr(digits))} size={compact ? "sm" : "md"} />
        </div>
      </div>

      <input
        ref={inputRef}
        id={inputId}
        name="pnr"
        className="sr-only text-base"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={12}
        value={formatPnr(digits)}
        onChange={(event) => onChange(normalizePnr(event.target.value))}
        onKeyDown={onKeyDown}
        aria-invalid={status === "invalid" || undefined}
        aria-describedby={hintId}
        autoFocus={autoFocus}
        disabled={disabled}
      />

      {/* The row. Click anywhere on it to type; the caps are the input's face. */}
      <div
        className="flex flex-col rounded-lg focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-focus"
        onClick={() => inputRef.current?.focus()}
        aria-hidden="true"
      >
        <div className="flex items-end">
          {GROUPS.map((group, gi) => (
            <div key={group.label} className={cn("flex min-w-0 flex-col", gi > 0 && "ml-2 sm:ml-4")} style={{ flex: `${group.keys.length} 1 0%` }}>
              {/* Position numbers, as silkscreened above the caps */}
              <div className="mb-1.5 flex gap-1 sm:gap-2">
                {group.keys.map((k) => (
                  <span key={k} className={cn("silk flex-1 text-center", k === litIndex && !running ? "text-ink-1" : "text-ink-3")}>
                    {k + 1}
                  </span>
                ))}
              </div>
              {/* The caps */}
              <div className="flex gap-1 sm:gap-2">
                {group.keys.map((k) => {
                  const digit = digits[k] ?? "";
                  const armed = digit !== "";
                  const lit = armed || allLit || (running && k === litIndex);
                  const caretHere = !running && !allLit && k === litIndex;
                  return (
                    <span
                      key={k}
                      data-key={k + 1}
                      data-armed={armed || undefined}
                      className={cn(
                        "key-cap relative flex min-w-0 flex-1 flex-col items-center overflow-hidden border bg-surface-2",
                        compact ? "h-12" : "h-16 sm:h-20",
                        caretHere ? "border-focus" : "border-line",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute inset-x-0 top-0 h-1 transition-opacity duration-(--duration-fast)",
                          STRIP[group.colour],
                          lit ? "opacity-100" : "opacity-30",
                        )}
                      />
                      <span className={cn("flex flex-1 items-center font-display font-semibold leading-none", armed ? "text-ink-1" : "text-ink-3", compact ? "text-lg" : "text-2xl sm:text-3xl")}>{digit}</span>
                    </span>
                  );
                })}
              </div>
              {/* Bank ruler */}
              <div className="mt-1.5 flex items-center gap-1">
                <span className="h-1.5 w-px bg-line-strong" />
                <span className="h-px flex-1 bg-line" />
                <span className="silk px-1 text-ink-3">{group.label}</span>
                <span className="h-px flex-1 bg-line" />
                <span className="h-1.5 w-px bg-line-strong" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Action strip: hint · clear · RUN */}
      <div className="flex flex-wrap items-center gap-3">
        <p
          id={hintId}
          className={cn("min-w-0 flex-1 text-sm", status === "invalid" ? "font-medium text-stop" : status === "ready" ? "text-go" : "text-ink-2")}
          role={status === "invalid" ? "alert" : undefined}
          aria-live={status === "invalid" ? undefined : "polite"}
        >
          {hintFor(status, digits, errorMessage, stage)}
        </p>
        <div className="flex items-center gap-3">
          {digits.length > 0 && !running ? (
            <IconButton
              label={messages.check.clear}
              icon={<DismissRegular className="size-5" aria-hidden="true" />}
              onClick={() => {
                onChange("");
                onClear?.();
                inputRef.current?.focus();
              }}
            />
          ) : null}
          <Button type="submit" variant="run" size={compact ? "md" : "lg"} loading={running} disabled={disabled} className={compact ? "min-w-28" : "min-w-36"}>
            {messages.check.submit}
          </Button>
        </div>
      </div>
    </div>
  );
}
