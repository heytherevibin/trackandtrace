import { messages } from "@/messages";
import type { RecentCheck } from "@/services/stores/recent-store";
import type { PassengerSeat, PnrOutcome, PnrResult, TicketStatus } from "@/types/domain";
import { formatTime } from "@/utils/datetime";
import { formatPnr } from "@/utils/pnr";
import { statusDescription, statusLabel } from "@/utils/status-tone";
import { chartValue, sourceTagFor, timeValue } from "./record-values";

// The check plate's behaviour as pure functions: the drawn `formVals` states and
// the `buildResult` view, fed by the real outcome instead of a local port.

export type FieldStatus = "idle" | "partial" | "ready" | "invalid" | "running";
export type LampState = "off" | "lit" | "busy";

/** The running state is held at least this long so the sweep reads. */
export const MIN_RUNNING_MS = 900;

export function fieldStatus({ digits, attempted, running }: { readonly digits: string; readonly attempted: boolean; readonly running: boolean }): FieldStatus {
  const valid = digits.length === 10;
  if (running) return "running";
  if (attempted && !valid) return "invalid";
  if (valid) return "ready";
  return digits.length === 0 ? "idle" : "partial";
}

export function hintFor(status: FieldStatus, digits: string, sampleMode: boolean): string {
  const m = messages.check;
  switch (status) {
    case "idle":
      return sampleMode ? m.hints.idleSample : m.hints.idle;
    case "partial":
      return m.progress(digits.length);
    case "ready":
      return m.hints.ready;
    case "invalid":
      return digits.length < 10 ? m.errorIncomplete : m.errorInvalid;
    case "running":
      return m.hints.running;
  }
}

export function lampFor(status: FieldStatus): { readonly state: LampState; readonly label: string } {
  const m = messages.check.lamp;
  if (status === "running") return { state: "busy", label: m.running };
  if (status === "ready") return { state: "lit", label: m.ready };
  if (status === "invalid") return { state: "off", label: m.invalid };
  return { state: "off", label: m.idle };
}

/** The cell carrying the caret, or null when the row is full or running. */
export function caretIndex(digits: string, status: FieldStatus): number | null {
  if (status === "running" || status === "ready") return null;
  return Math.min(digits.length, 9);
}

export interface TerminalFact {
  readonly label: string;
  readonly value: string;
}

export interface PaxRow {
  readonly key: string;
  readonly name: string;
  readonly booked: string;
  readonly current: string;
  readonly alloc: string;
}

export type TerminalResultKind = "ok" | "notfound" | "unavailable" | "limited" | "refused";

export interface TerminalResult {
  readonly kind: TerminalResultKind;
  readonly pnr: string;
  readonly pnrLabel: string;
  readonly statusShort: string;
  readonly statusBig: string;
  readonly statusLong: string;
  readonly sample: boolean;
  /** The result came from the third-party RapidAPI source (or that source failed to answer). */
  readonly thirdParty: boolean;
  readonly provenance: string;
  readonly facts: readonly TerminalFact[];
  readonly pax: readonly PaxRow[];
  readonly recent: RecentCheck;
}

function code(status: TicketStatus, position?: number | null): string {
  const r = messages.check.result;
  const base = r.codes[status];
  return (status === "RAC" || status === "WL") && typeof position === "number" ? r.withPosition(base, position) : base;
}

export function paxRows(pax: readonly PassengerSeat[]): readonly PaxRow[] {
  const m = messages.check.result.passengers;
  return pax.map((p) => ({
    key: String(p.index),
    name: m.nth(p.index),
    booked: code(p.bookingStatus),
    current: code(p.currentStatus, p.position),
    alloc: p.coach && p.berth ? messages.check.result.values.pair(p.coach, p.berth) : m.notAllocated,
  }));
}

/** The big status: the lead's label, or the party's distinct states when passengers differ. */
export function statusBigFor(result: PnrResult): string {
  const pax = result.snapshot.pax;
  const states = [...new Set(pax.map((p) => p.currentStatus))];
  if (pax.length > 1 && states.length > 1) {
    return messages.check.result.party(states.map((s) => messages.check.result.codes[s]).join(" · "), pax.length);
  }
  return statusLabel(result.lead.status, result.lead.position);
}

export function factsFor(result: PnrResult): readonly TerminalFact[] {
  const f = messages.check.result.facts;
  const v = messages.check.result.values;
  const { snapshot, lead } = result;
  const train = snapshot.train;
  return [
    { label: f.train, value: train.number },
    { label: f.route, value: v.route(train.from.code, train.to.code) },
    { label: f.journey, value: snapshot.journeyDateLabel },
    { label: f.classQuota, value: v.pair(snapshot.cls, lead.quota) },
    { label: f.departs, value: timeValue(train.depTime, v.departs) },
    ...(lead.coach && lead.berth ? [{ label: f.coachBerth, value: v.pair(lead.coach, lead.berth) }] : []),
    { label: f.chart, value: chartValue(snapshot, v.chart) },
  ];
}

export function recentLabelFor(result: PnrResult): string {
  const t = result.snapshot.train;
  return messages.check.result.recentLabel(t.number, t.from.code, t.to.code, result.snapshot.journeyDateLabel);
}

interface ResultContext {
  readonly pnr: string;
  readonly attemptedAt: Date;
  /** Server-computed: the labelled fixture is the source serving this deployment. */
  readonly sampleMode: boolean;
  /** Server-computed: the third-party RapidAPI source is serving this deployment. */
  readonly thirdPartyMode?: boolean;
}

export function terminalResult(outcome: PnrOutcome, { pnr, attemptedAt, sampleMode, thirdPartyMode = false }: ResultContext): TerminalResult {
  const r = messages.check.result;
  const attempted = formatTime(attemptedAt);
  const checkedAt = attemptedAt.toISOString();
  const base = { pnr, pnrLabel: r.pnr(formatPnr(pnr)), facts: [], pax: [], thirdParty: false } as const;
  const activeSource = sampleMode ? r.sources.fixture : thirdPartyMode ? r.sources.rapidapi : r.sources.live;

  if (outcome.ok) {
    const { result } = outcome;
    const tag = sourceTagFor(result.snapshot.source);
    const label = statusLabel(result.lead.status, result.lead.position);
    return {
      ...base,
      kind: "ok",
      statusShort: label,
      statusBig: statusBigFor(result),
      statusLong: statusDescription(result.lead.status),
      sample: tag === "sample",
      thirdParty: tag === "thirdParty",
      provenance: r.provenance.retrieved(formatTime(result.checkedAt), r.sources[result.snapshot.source]),
      facts: factsFor(result),
      pax: result.snapshot.pax.length > 1 ? paxRows(result.snapshot.pax) : [],
      recent: { pnr, label: recentLabelFor(result), status: result.lead.status, position: result.lead.position, checkedAt: result.checkedAt },
    };
  }

  switch (outcome.code) {
    case "NOT_FOUND":
      return {
        ...base,
        kind: "notfound",
        statusShort: r.notFound.short,
        statusBig: r.notFound.big,
        statusLong: r.notFound.long,
        sample: sampleMode,
        thirdParty: thirdPartyMode,
        provenance: r.provenance.retrievedOnly(attempted, activeSource),
        recent: { pnr, status: "NOT_FOUND", position: null, checkedAt },
      };
    case "RATE_LIMITED":
      return {
        ...base,
        kind: "limited",
        statusShort: r.limited.short,
        statusBig: r.limited.big,
        statusLong: r.limited.long(typeof outcome.retryAfter === "number" ? r.limited.retry(outcome.retryAfter) : r.limited.retryLater),
        sample: false,
        provenance: r.provenance.heldBack(attempted),
        recent: { pnr, label: r.limited.short, checkedAt },
      };
    case "INVALID":
      return {
        ...base,
        kind: "refused",
        statusShort: r.refused.short,
        statusBig: r.refused.big,
        statusLong: r.refused.long,
        sample: false,
        provenance: r.provenance.refused(attempted),
        recent: { pnr, label: r.refused.short, checkedAt },
      };
    case "SOURCE_UNAVAILABLE":
      return {
        ...base,
        kind: "unavailable",
        statusShort: r.unavailable.short,
        statusBig: thirdPartyMode ? r.unavailable.thirdPartyBig : r.unavailable.big,
        // The adapter's messages are written for readers: which failure, and that nothing was shown in its place.
        statusLong: thirdPartyMode ? outcome.message : r.unavailable.long,
        sample: false,
        thirdParty: thirdPartyMode,
        provenance: thirdPartyMode ? r.provenance.thirdPartySilent(attempted, r.sources.rapidapi) : r.provenance.silent(attempted),
        recent: { pnr, label: r.unavailable.short, checkedAt },
      };
  }
}
