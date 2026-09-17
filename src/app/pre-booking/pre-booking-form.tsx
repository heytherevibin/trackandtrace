"use client";

import { useId, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Corners } from "@/components/ui/corners";
import { NativeSelect } from "@/components/ui/native-select";
import { messages } from "@/messages";
import { QUOTA_VALUES } from "@/types/booking";
import type { BookingClass, Quota } from "@/types/domain";
import { cn } from "@/utils/cn";

// Transcribed from the Claude Design sheet "Pre-booking B": Form T&T-02, the honest
// result plate, and the request lifecycle. Real behaviour only: the IST minimum date,
// the past-date guard, and an unavailable answer. No train list is invented.

/** The class options in the order the sheet draws them. */
const DRAWN_CLASSES: readonly BookingClass[] = ["1A", "2A", "3A", "SL", "CC", "EC", "2S"];

const isClass = (value: string): value is BookingClass => DRAWN_CLASSES.some((c) => c === value);
const isQuota = (value: string): value is Quota => QUOTA_VALUES.some((q) => q === value);

/** Today in IST as YYYY-MM-DD. */
function todayIst(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}
const subscribeNever = () => () => undefined;
/** The server has no reader's clock: the minimum date is set on the client only. */
const noDateOnServer = () => "";

interface AvailabilityRequest {
  readonly cls: BookingClass;
  readonly quota: Quota;
  readonly date: string;
}

// The sheet's type roles, exactly as drawn (inherited line height 1.5 unless the sheet sets one).
// Composed with template strings, not cn(): tailwind-merge reads custom sizes such as
// text-label as colours and would drop them next to text-ink-1/70.
const CELL = "font-display text-label font-semibold uppercase leading-6 tracking-caps text-pretty";
const FIELD_LABEL = "font-display text-xs font-semibold uppercase leading-normal tracking-caps text-accent-text";
const FIELD = "flex min-w-0 flex-col gap-1.5";
const FACT_LABEL = "font-display text-2xs font-semibold uppercase leading-normal tracking-caps text-ink-1/70";
const FACT_VALUE = "font-display text-base font-semibold leading-normal tracking-head";

export function PreBookingForm() {
  const m = messages.booking;
  const ids = useId();
  const [cls, setCls] = useState<BookingClass>("3A");
  const [quota, setQuota] = useState<Quota>("GN");
  const [date, setDate] = useState("");
  const [submitted, setSubmitted] = useState<AvailabilityRequest | null>(null);
  const minDate = useSyncExternalStore(subscribeNever, todayIst, noDateOnServer);
  const pastDate = date.length > 0 && minDate.length > 0 && date < minDate;
  const ready = date.length > 0 && minDate.length > 0 && !pastDate;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) return;
    setSubmitted({ cls, quota, date });
  };

  const facts = [
    { label: m.result.responseLabel, value: m.result.responseValue },
    { label: m.result.provenanceLabel, value: m.result.provenanceValue },
    { label: m.result.fallbackLabel, value: m.result.fallbackValue },
  ];

  const steps = [
    { id: "input", title: m.steps.input, detail: submitted ? m.stepStates.done : m.stepStates.waiting, done: submitted !== null },
    { id: "validate", title: m.steps.validate, detail: submitted ? m.stepStates.done : m.stepStates.waiting, done: submitted !== null },
    { id: "source", title: m.steps.source, detail: m.stepStates.pending, done: false },
    { id: "result", title: m.steps.result, detail: m.stepStates.unavailable, done: false },
  ];

  return (
    <>
      <form onSubmit={submit} noValidate className="blueprint mt-8" aria-labelledby={`${ids}-form`}>
        <Corners />
        <div className="flex flex-wrap items-stretch border-b border-line">
          <h2 id={`${ids}-form`} className={`${CELL} min-w-[14ch] flex-1 px-5 py-2.5`}>
            {m.form.title}
          </h2>
          <span className={`${CELL} whitespace-nowrap border-l border-line px-5 py-2.5 text-ink-1/70`}>{m.form.sheet}</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] items-end gap-4 p-5">
          <div className={FIELD}>
            <span className={FIELD_LABEL}>{m.train.label}</span>
            <div role="status" className="flex h-10 items-center gap-2 border border-dashed border-line px-3 text-sm text-ink-1/70">
              {m.train.notConnected}
            </div>
          </div>
          <div className={FIELD}>
            <label htmlFor={`${ids}-cls`} className={FIELD_LABEL}>
              {m.cls}
            </label>
            <NativeSelect
              id={`${ids}-cls`}
              value={cls}
              onChange={(event) => {
                const next = event.target.value;
                if (isClass(next)) setCls(next);
              }}
              options={DRAWN_CLASSES.map((value) => ({ value, label: m.classes[value] }))}
            />
          </div>
          <div className={FIELD}>
            <label htmlFor={`${ids}-quota`} className={FIELD_LABEL}>
              {m.quota}
            </label>
            <NativeSelect
              id={`${ids}-quota`}
              value={quota}
              onChange={(event) => {
                const next = event.target.value;
                if (isQuota(next)) setQuota(next);
              }}
              options={QUOTA_VALUES.map((value) => ({ value, label: m.quotas[value] }))}
            />
          </div>
          <div className={FIELD}>
            <label htmlFor={`${ids}-date`} className={FIELD_LABEL}>
              {m.date}
            </label>
            <input
              id={`${ids}-date`}
              name="date"
              type="date"
              min={minDate || undefined}
              value={date}
              onChange={(event) => {
                setDate(event.target.value);
                setSubmitted(null);
              }}
              aria-invalid={pastDate || undefined}
              aria-describedby={pastDate ? `${ids}-past` : undefined}
              className="well h-10 w-full px-2.5"
            />
          </div>
          <Button type="submit" variant="primary" className="h-10" disabled={!ready}>
            {m.submit}
          </Button>
        </div>
        {pastDate ? (
          <p id={`${ids}-past`} className="px-5 pb-4 text-sm text-accent-soft-ink">
            {m.pastDate}
          </p>
        ) : null}
      </form>

      <div role="status" aria-live="polite">
        {submitted ? (
          <div className="blueprint mt-[28px] p-6">
            <Corners />
            <h2 className="text-3xl leading-[1.12] tracking-head text-pretty">{m.result.title}</h2>
            <p className="mt-2.5 max-w-[64ch] text-body text-ink-1/78">{`${m.result.detail} ${m.result.requested(submitted.cls, submitted.quota, submitted.date)}`}</p>
            <dl className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 border-t border-line pt-3.5">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt className={FACT_LABEL}>{fact.label}</dt>
                  <dd className={FACT_VALUE}>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>

      <section className="blueprint mt-[28px]" aria-labelledby={`${ids}-lifecycle`}>
        <Corners />
        <div className="flex flex-wrap items-stretch border-b border-line">
          <h2 id={`${ids}-lifecycle`} className={`${CELL} min-w-[14ch] flex-1 px-5 py-2.5`}>
            {m.lifecycle}
          </h2>
        </div>
        <ol aria-labelledby={`${ids}-lifecycle`} className="flex flex-col p-5">
          {steps.map((step, index) => (
            <li key={step.id} data-state={step.done ? "done" : "pending"} className="flex gap-3.5">
              <span aria-hidden="true" className="flex flex-col items-center">
                <span className={cn("mt-1 size-3 shrink-0 rounded-full border", step.done ? "border-accent bg-accent" : "border-line bg-transparent")} />
                {index < steps.length - 1 ? <span className="min-h-5 w-px flex-1 bg-line" /> : null}
              </span>
              <span className="pb-[18px]">
                <span className="block font-display text-base font-semibold uppercase leading-normal tracking-head">{step.title}</span>
                <span className="mt-0.5 block text-label leading-normal text-ink-1/70">{step.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
