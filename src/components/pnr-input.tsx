"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { formatPnr, isValidPnr, normalizePnr } from "@/lib/engine";
import { Button, ButtonIcon } from "./ui";
import { DismissRegular } from "@fluentui/react-icons";

export function PnrInput() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [shake, setShake] = useState(false);

  const digits = normalizePnr(raw);
  const valid = isValidPnr(digits);

  const hint = (() => {
    if (digits.length === 0) return "Find the 10 digits on the top-left of your ticket";
    if (!/^[2-9]/.test(digits) && digits.length > 0)
      return "A PNR never starts with 0 or 1 — check the first digit";
    if (digits.length < 10) return `${digits.length}/10 digits entered`;
    if (!valid) return "That doesn't look like a valid PNR";
    return "Signal ready — reading the ticket";
  })();

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!valid) {
      setShake(true);
      window.setTimeout(() => setShake(false), 420);
      return;
    }
    router.push(`/pnr/${digits}`);
  };

  return (
    <form onSubmit={submit} className="w-full" noValidate>
      <div
        className="well relative overflow-hidden"
        style={{
          ...(shake ? { animation: "shake-x 380ms ease" } : {}),
          boxShadow: 'inset 0 3px 16px rgba(0,0,0,0.65), inset 0 1px 2px rgba(0,0,0,0.4), inset 0 -1px 0 rgba(201,162,95,0.08), 0 12px 32px -12px rgba(0,0,0,0.5)',
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brass/20 to-transparent" />
        <label
          htmlFor="pnr"
          className="plate-label flex items-center justify-between px-5 pt-4"
        >
          <span>Passenger name record</span>
          <span className="inline-flex items-center gap-1.5 font-data text-[10px] normal-case tracking-[0.18em] text-steel">
            <span className={`size-1.5 rounded-full ${valid ? "bg-go shadow-[0_0_8px_rgba(47,191,113,0.9)]" : digits.length ? "bg-watch" : "bg-steel"}`} />
            {valid ? "LOCKED" : digits.length >= 10 ? "CHECK" : "INPUT"}
          </span>
        </label>

        <div className="flex items-center gap-3 px-4 py-2 sm:px-5 sm:py-3">
          <input
            id="pnr"
            inputMode="numeric"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={formatPnr(digits)}
            placeholder="234 567 8901"
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            aria-invalid={digits.length === 10 && !valid}
            aria-describedby="pnr-hint"
            className="w-full min-w-0 bg-transparent py-1.5 font-data font-medium tracking-[0.14em] text-bone placeholder:text-steel/40 focus:outline-none sm:py-2.5"
            style={{ fontSize: "clamp(1.35rem, 4.5vw, 2rem)" }}
          />
          {digits.length > 0 && (
            <button
              type="button"
              onClick={() => setRaw("")}
              className="shrink-0 rounded-full p-1.5 text-steel/60 transition-colors hover:text-bone"
              aria-label="Clear input"
            >
              <DismissRegular className="size-4" />
            </button>
          )}
          <Button type="submit" variant="primary" className="shrink-0 px-6 py-3.5">
            <span className="text-[14px]">Read signal</span>
            <ButtonIcon>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </ButtonIcon>
          </Button>
        </div>

        <div className="flex items-center justify-between px-5 pb-3.5">
          <span
            id="pnr-hint"
            className={`min-w-0 truncate text-[11px] tracking-wide ${
              valid ? "text-go" : digits.length === 10 ? "text-stop" : "text-steel"
            }`}
          >
            {hint}
          </span>
          <span className="hidden shrink-0 font-data text-[10px] tracking-[0.2em] text-steel/70 sm:block">
            ENTER ↵
          </span>
        </div>
      </div>
    </form>
  );
}