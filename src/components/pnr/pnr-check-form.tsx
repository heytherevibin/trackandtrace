"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { recentStore } from "@/services/stores/recent-store";
import { cn } from "@/utils/cn";
import { PnrField, PnrStub, useShake } from "./pnr-field";
import { fieldStatus } from "./pnr-terminal-state";

/**
 * The check in navigate mode, for surfaces that are not the landing sheet (the not-found pages):
 * the same entry block and stub as the plate, but Run records the check and opens the full record.
 * Without JavaScript the form still submits to /check.
 */
export function PnrCheckForm({ id = "pnr", autoFocus = false, compact = false, className }: { readonly id?: string; readonly autoFocus?: boolean; readonly compact?: boolean; readonly className?: string }) {
  const router = useRouter();
  const [digits, setDigits] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { shaking, shake, onAnimationEnd } = useShake();
  const status = fieldStatus({ digits, attempted, running });

  const run = () => {
    if (running) return;
    if (digits.length !== 10) {
      setAttempted(true);
      shake();
      return;
    }
    recentStore.push({ pnr: digits, checkedAt: new Date().toISOString() });
    setRunning(true);
    router.push(`/pnr/${digits}`);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    run();
  };

  return (
    <form onSubmit={onSubmit} action="/check" method="get" noValidate className={cn("w-full", shaking && "shake", className)} onAnimationEnd={onAnimationEnd} data-testid="pnr-check-form">
      <PnrField
        id={id}
        digits={digits}
        status={status}
        sampleMode={false}
        onDigits={(next) => {
          setDigits(next);
          setAttempted(false);
        }}
        onEnter={run}
        inputRef={inputRef}
        onActivate={() => inputRef.current?.focus()}
        autoFocus={autoFocus}
      />
      <div aria-hidden="true" className={compact ? "mt-4" : "perforation my-[18px]"} />
      <PnrStub
        status={status}
        showClear={digits.length > 0 && !running}
        onClear={() => {
          setDigits("");
          setAttempted(false);
          inputRef.current?.focus();
        }}
        runType="submit"
      />
    </form>
  );
}
