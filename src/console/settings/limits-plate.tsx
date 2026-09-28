"use client";

import { useState } from "react";
import { Plate } from "@/components/ui/plate";
import { ConfirmItsYou } from "@/console/components/confirm-its-you";
import { consoleMessages } from "@/console/messages";
import { saveLiveChecks } from "@/console/settings/settings-client";
import type { Limits } from "@/console/settings/settings";
import { settingsTap } from "@/console/settings/settings-tap";
import { cn } from "@/utils/cn";

// PLATE "Limits" (Console Switches.dc.html), and one row of the two it draws.
//
// **Why one row.** Of the eight switches the sheet draws across its two plates, `live_checks_per_day`
// is the only one anything reads: the rate limits are module constants, the source registry reads
// the environment, and the traveller side of the notice has not been built. A control that writes an
// audit row and changes nothing tells an operator the site is doing something it is not — the same
// failure that left this very column unread from PR #23 until it was wired. The second row is drawn
// as a statement of fact rather than a dead field.
//
// The sheet's PROPS are the states below: ready, saving, saved, failed. Its CHECKS are the two
// things every row must carry — who changed it last and when — and the before → after inside TC-01.

const m = consoleMessages.settings;

const MIN = 1;
const MAX = 1_000_000;

/** What a save came back as. `stale` is a lost version race, which is not the same failure as a store that could not be reached. */
export type SaveResult = { readonly ok: true } | { readonly ok: false; readonly stale: boolean };

type Stage = { readonly kind: "ready" } | { readonly kind: "confirming"; readonly next: number } | { readonly kind: "saving" } | { readonly kind: "saved"; readonly value: number } | { readonly kind: "failed"; readonly stale: boolean };

/** `changed_at` as the console prints times: IST, to the minute. */
export function readWhen(iso: string | null): string | null {
  if (iso === null) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return `${at.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}, ${at.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" })} IST`;
}

/**
 * `save` defaults to the real call rather than being passed in from the page: a function cannot
 * cross the server/client boundary as a prop, and the alternative — a second client wrapper whose
 * only job is to supply it — is a file that exists to satisfy a boundary. The prop stays so the
 * test can mock at the network edge.
 */
export function LimitsPlate({
  limits,
  environment,
  save = saveLiveChecks,
}: {
  readonly limits: Limits;
  /** The deployment the save writes to — the tap's target, as console_save_settings spends it. */
  readonly environment: string;
  readonly save?: (value: number, version: number, reason: string) => Promise<SaveResult>;
}) {
  const [typed, setTyped] = useState(String(limits.liveChecks.value));
  const [reason, setReason] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "ready" });
  const [refused, setRefused] = useState<string | null>(null);

  const when = readWhen(limits.changedAt);
  const lastChanged = when !== null && limits.changedBy !== null ? m.lastChanged(when, limits.changedBy) : m.neverChanged;

  /**
   * Both refusals happen HERE, before TC-01 opens, and that is the point of checking them twice:
   * the database refuses them too, but a tap is a physical act — asking someone to touch a key for
   * a number the store is going to reject is spending their attention on nothing.
   */
  function onSave(): void {
    const next = Number(typed);
    if (!Number.isInteger(next) || next < MIN || next > MAX) {
      setRefused(m.limits.liveChecks.outOfRange);
      return;
    }
    if (next === limits.liveChecks.value && limits.liveChecks.fromConsole) {
      setRefused(m.limits.liveChecks.unchanged);
      return;
    }
    // A number equal to the deployment's default is still a change when the console has not taken
    // the switch over: it is the difference between "300 because nobody said" and "300 because
    // somebody decided", and only the second survives a deployment changing its own default.
    if (next === limits.liveChecks.value && !limits.liveChecks.fromConsole) {
      setRefused(m.limits.liveChecks.unchanged);
      return;
    }
    setRefused(null);
    setStage({ kind: "confirming", next });
  }

  async function onConfirmed(): Promise<void> {
    if (stage.kind !== "confirming") return;
    const next = stage.next;
    setStage({ kind: "saving" });
    // `version` is null only when there is no settings row at all, which cannot happen — the
    // migration inserts one per environment — but a null would reach the database as a null and be
    // refused there with a developer string. Refusing here says the true thing instead.
    if (limits.version === null) {
      setStage({ kind: "failed", stale: false });
      return;
    }
    const result = await save(next, limits.version, reason);
    setStage(result.ok ? { kind: "saved", value: next } : { kind: "failed", stale: result.stale });
  }

  return (
    <>
      <Plate as="section" title={m.limits.legend} headingLevel={2} className="mt-6">
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="legend-sm">{m.limits.liveChecks.name}</span>
            <span className="text-ink-1/70 text-sm">{m.limits.liveChecks.across}</span>
            {/* A meter that could not be read is absent, never a zero: "0 used today" is a claim
                about a quiet day, and drawing it for an unread counter says the site is idle when
                it may be busy. */}
            {limits.used === null ? null : <span className="font-data text-sm">{m.limits.liveChecks.used(limits.used)}</span>}
          </div>

          <p className="text-ink-1/70 mt-1 text-sm">{m.limits.liveChecks.legend}</p>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="legend-sm">{m.limits.liveChecks.field}</span>
              <input
                type="number"
                inputMode="numeric"
                min={MIN}
                max={MAX}
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  setRefused(null);
                }}
                className="well font-data w-40 px-3 py-2"
              />
            </label>
            <button type="button" onClick={onSave} disabled={stage.kind === "saving"} className="press border-line cursor-pointer border px-4 py-2">
              {stage.kind === "saving" ? m.state.saving : m.limits.liveChecks.save}
            </button>
            {limits.liveChecks.fromConsole ? null : <span className="text-ink-1/70 text-sm">{m.limits.liveChecks.fromDeployment(limits.liveChecks.value)}</span>}
          </div>

          <p className="text-ink-1/70 mt-2 text-xs">{lastChanged}</p>

          {refused === null ? null : <p className={cn("mt-2 text-sm", "text-closed-soft-ink")}>{refused}</p>}
          {stage.kind === "saved" ? <p className="mt-2 text-sm">{m.state.saved(m.limits.liveChecks.name + " " + stage.value)}</p> : null}
          {stage.kind === "failed" ? <p className="text-closed-soft-ink mt-2 text-sm">{stage.stale ? m.state.stale : m.state.failed}</p> : null}
        </div>
      </Plate>

      <ConfirmItsYou
        open={stage.kind === "confirming"}
        // Exactly the four fields console_save_settings spends (settings-tap.ts). These once read
        // m.tap.action / m.tap.target / String(next), and every save was refused.
        {...settingsTap(environment, { live_checks_per_day: stage.kind === "confirming" ? stage.next : limits.liveChecks.value })}
        reason={reason}
        summary={m.tap.summary}
        change={{ label: m.tap.changeLabel, before: String(limits.liveChecks.value), after: stage.kind === "confirming" ? String(stage.next) : "" }}
        onReasonChange={setReason}
        onCancel={() => setStage({ kind: "ready" })}
        onConfirmed={() => {
          void onConfirmed();
        }}
      />
    </>
  );
}
