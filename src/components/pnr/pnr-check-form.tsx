"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { messages } from "@/messages";
import { recentStore } from "@/services/stores/recent-store";
import { cn } from "@/utils/cn";
import { isValidPnr, normalizePnr } from "@/utils/pnr";
import { PnrField, type PnrFieldStatus } from "./pnr-field";

/** The check form: owns the digits, validates on Run, and navigates to the result. */
export function PnrCheckForm({ id = "pnr", autoFocus = false, compact = false, className }: { readonly id?: string; readonly autoFocus?: boolean; readonly compact?: boolean; readonly className?: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [running, setRunning] = useState(false);
  const [shakeToken, setShakeToken] = useState(0);

  const digits = normalizePnr(value);
  const valid = isValidPnr(digits);
  const status: PnrFieldStatus = running ? "running" : attempted && !valid ? "invalid" : valid ? "ready" : digits.length === 0 ? "idle" : "partial";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (!valid) {
      setShakeToken((n) => n + 1);
      return;
    }
    // Record the check the moment it runs; the result view enriches it with the status.
    recentStore.push({ pnr: digits, checkedAt: new Date().toISOString() });
    setRunning(true);
    router.push(`/pnr/${digits}`);
  };

  return (
    <form onSubmit={submit} action="/check" method="get" noValidate className={cn("w-full", className)} data-testid="pnr-check-form">
      <PnrField
        id={id}
        value={value}
        onChange={(next) => {
          setValue(next);
          setAttempted(false);
        }}
        onSubmit={() => submit(new Event("submit") as unknown as FormEvent)}
        status={status}
        stage="validate"
        errorMessage={digits.length < 10 ? messages.check.errorIncomplete : messages.check.errorInvalid}
        autoFocus={autoFocus}
        shakeToken={shakeToken}
        compact={compact}
      />
    </form>
  );
}
