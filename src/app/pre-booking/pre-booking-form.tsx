"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Led } from "@/components/ui/led";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Timeline } from "@/components/ui/timeline";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { messages } from "@/messages";
import { CLASS_VALUES, QUOTA_VALUES } from "@/types/booking";
import type { BookingClass, Quota } from "@/types/domain";

function todayIst(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

/** An honest form: real class and quota codes, a date, and no invented train list. */
export function PreBookingForm() {
  const m = messages.booking;
  const [cls, setCls] = useState<BookingClass>("3A");
  const [quota, setQuota] = useState<Quota>("GN");
  const [date, setDate] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const minDate = todayIst();
  const pastDate = date.length > 0 && date < minDate;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!date || pastDate) return;
    setSubmitted(m.requested(cls, quota, date));
  };

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} noValidate className="panel p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto] lg:items-end">
          <div className="flex flex-col gap-1.5">
            <span className="silk">{m.train.label}</span>
            <div className="flex h-11 items-center gap-2 rounded-md border border-dashed border-line-strong px-3 text-sm text-ink-2" role="status">
              <Led tone="watch" lit />
              {m.train.notConnected}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cls" className="silk">
              {m.cls}
            </label>
            <Select id="cls" value={cls} onValueChange={(v) => v && setCls(v as BookingClass)} options={CLASS_VALUES.map((v) => ({ value: v, label: m.classes[v] }))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="quota" className="silk">
              {m.quota}
            </label>
            <Select id="quota" value={quota} onValueChange={(v) => v && setQuota(v as Quota)} options={QUOTA_VALUES.map((v) => ({ value: v, label: m.quotas[v] }))} />
          </div>
          <Field name="date" invalid={pastDate}>
            <FieldLabel>{m.date}</FieldLabel>
            <Input type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} />
            <FieldError match={pastDate}>{m.pastDate}</FieldError>
          </Field>
          <Button type="submit" variant="run" size="lg" disabled={!date || pastDate}>
            {m.submit}
          </Button>
        </div>
      </form>
      {submitted ? <UnavailableState title={m.unavailableTitle} detail={`${m.unavailableDetail} ${submitted}`} /> : null}
      <Panel legend={m.lifecycle} legendId="lifecycle-legend">
        <Timeline
          label={m.lifecycle}
          steps={[
            { id: "input", title: m.steps.input, state: submitted ? "done" : "pending" },
            { id: "validate", title: m.steps.validate, state: submitted ? "done" : "pending" },
            { id: "source", title: m.steps.source, detail: m.stepStates.pending, state: submitted ? "failed" : "pending" },
            { id: "result", title: m.steps.result, detail: m.stepStates.unavailable, state: "pending" },
          ]}
        />
      </Panel>
    </div>
  );
}
