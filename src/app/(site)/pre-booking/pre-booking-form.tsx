"use client";

import { useEffect, useId, useState, useSyncExternalStore, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Corners } from "@/components/ui/corners";
import { NativeSelect } from "@/components/ui/native-select";
import { PLATE_TITLE_STACK, plateCellClass } from "@/components/ui/plate";
import { Timeline } from "@/components/ui/timeline";
import { messages } from "@/messages";
import type { AvailabilityAnswer } from "@/services/availability-source";
import type { RouteTrain } from "@/services/route-source";
import { QUOTA_VALUES, type FormClass, type FormQuota } from "@/types/booking";
import { cn } from "@/utils/cn";
import { AvailabilityPlate } from "./availability-plate";
import { lifecycleSteps, type ReadPhase, type RoutePhase } from "./availability-lifecycle";

// Form TL-02, transcribed from the Claude Design sheet "Pre-booking Availability".
//
// Stations first, then the train. That order is not a preference: the source has no train-to-route
// lookup, and the availability endpoint needs a station pair, so a train chosen from anywhere else
// could never be asked about. See `route-source.ts`.
//
// Nothing is estimated here and no day is ever invented. When the chart cannot be read the result
// plate says so — there is no branch that renders a table with no rows in it.

const CELL = "font-display text-label font-semibold uppercase leading-6 tracking-caps text-pretty";
const FIELD_LABEL = "font-display text-xs font-semibold uppercase leading-normal tracking-caps text-accent-text";
const FIELD = "flex min-w-0 flex-col gap-1.5";
const FACT_LABEL = "font-display text-2xs font-semibold uppercase leading-normal tracking-caps text-ink-1/70";
const FACT_VALUE = "font-display text-base font-semibold leading-normal tracking-head";

const DRAWN_CLASSES: readonly FormClass[] = ["1A", "2A", "3A", "SL", "CC", "EC", "2S"];
const STATION = /^[A-Za-z]{2,5}$/;
const isClass = (value: string): value is FormClass => DRAWN_CLASSES.some((c) => c === value);
const isQuota = (value: string): value is FormQuota => QUOTA_VALUES.some((q) => q === value);

/** Today in IST as YYYY-MM-DD. */
function todayIst(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}
const subscribeNever = () => () => undefined;
const noDateOnServer = () => "";

function istClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
}

interface Asked {
  readonly trainNo: string;
  readonly cls: FormClass;
  readonly quota: FormQuota;
  readonly date: string;
}

export function PreBookingForm() {
  const m = messages.booking;
  const ids = useId();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [lookup, setLookup] = useState<{ readonly key: string; readonly phase: RoutePhase; readonly trains: readonly RouteTrain[] }>({ key: "", phase: "idle", trains: [] });
  const [picked, setPicked] = useState("");
  const [cls, setCls] = useState<FormClass>("3A");
  const [quota, setQuota] = useState<FormQuota>("GN");
  const [date, setDate] = useState("");
  const [asked, setAsked] = useState<Asked | null>(null);
  const [read, setRead] = useState<ReadPhase>("idle");
  const [answer, setAnswer] = useState<AvailabilityAnswer | null>(null);
  const [failure, setFailure] = useState<string>("");
  const [sampleData, setSampleData] = useState(false);
  const minDate = useSyncExternalStore(subscribeNever, todayIst, noDateOnServer);
  const pastDate = date.length > 0 && minDate.length > 0 && date < minDate;

  const pair = STATION.test(from.trim()) && STATION.test(to.trim());
  const upperFrom = from.trim().toUpperCase();
  const upperTo = to.trim().toUpperCase();

  // The route is looked up as soon as both codes read like codes, and never on every keystroke: it
  // costs a provider request from a plan shared with live PNR checks and the crawler.
  //
  // Nothing is set synchronously in the effect body. The phases a reader sees are derived from the
  // one piece of state this owns — which pair it last answered for — so an in-flight lookup cannot
  // leave a stale train list on screen beside a new pair.
  const key = pair ? `${upperFrom}-${upperTo}` : "";

  useEffect(() => {
    if (!key) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLookup({ key, phase: "looking", trains: [] });
      void (async () => {
        const [askedFrom, askedTo] = key.split("-");
        try {
          const res = await fetch(`/api/trains?from=${encodeURIComponent(askedFrom ?? "")}&to=${encodeURIComponent(askedTo ?? "")}`, { signal: controller.signal });
          const body = (await res.json()) as { ok?: boolean; sampleData?: boolean; trains?: readonly RouteTrain[] };
          if (!res.ok || body.ok !== true || !Array.isArray(body.trains)) {
            setLookup({ key, phase: "error", trains: [] });
            return;
          }
          setLookup({ key, phase: body.trains.length > 0 ? "found" : "none", trains: body.trains });
        } catch {
          if (!controller.signal.aborted) setLookup({ key, phase: "error", trains: [] });
        }
      })();
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [key]);

  // Only the answer for the pair on screen counts; anything else is still on its way.
  const fresh = key !== "" && lookup.key === key;
  const route: RoutePhase = key === "" ? "idle" : fresh ? lookup.phase : "looking";
  const trains = fresh ? lookup.trains : [];

  // The first train of a route is the one offered until the reader picks another.
  const chosen = trains.find((t) => t.trainNo === picked) ?? trains[0] ?? null;
  const ready = chosen !== null && date.length > 0 && !pastDate;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || !chosen) return;
    const request = { trainNo: chosen.trainNo, cls, quota, date };
    setAsked(request);
    setRead("reading");
    setAnswer(null);
    void (async () => {
      try {
        const res = await fetch("/api/availability", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ trainNo: chosen.trainNo, from: chosen.fromCode, to: chosen.toCode, journeyDate: date, travelClass: cls, quota }),
        });
        const body = (await res.json()) as { ok?: boolean; message?: string; sampleData?: boolean } & Partial<AvailabilityAnswer>;
        if (!res.ok || body.ok !== true || !Array.isArray(body.days)) {
          setFailure(typeof body.message === "string" ? body.message : messages.source.availability.couldNotAnswer);
          setRead("error");
          return;
        }
        setSampleData(body.sampleData === true);
        setAnswer(body as AvailabilityAnswer);
        setRead("ok");
      } catch {
        setFailure(messages.source.availability.couldNotAnswer);
        setRead("error");
      }
    })();
  };

  const at = answer ? istClock(answer.retrievedAt) : istClock(new Date().toISOString());
  const steps = lifecycleSteps({
    route,
    read,
    from: upperFrom,
    to: upperTo,
    train: chosen ? { name: chosen.trainName, fromCode: chosen.fromCode, toCode: chosen.toCode } : null,
    asked: asked ? { trainNo: asked.trainNo, cls: asked.cls, quota: asked.quota, date: asked.date } : null,
    days: answer?.days.length ?? 0,
    at,
    hasDate: date.length > 0,
  });

  const trainOptions =
    trains.length > 0
      ? trains.map((t) => ({ value: t.trainNo, label: `${t.trainNo} · ${t.trainName}` }))
      : [{ value: "", label: route === "none" ? m.train.none : route === "looking" ? m.train.looking : m.train.waiting }];

  return (
    <>
      <form onSubmit={submit} noValidate className="blueprint mt-8" aria-labelledby={`${ids}-form`}>
        <Corners />
        <div className="flex flex-wrap items-stretch border-b border-line">
          <h2 id={`${ids}-form`} className={`${CELL} min-w-[14ch] flex-1 px-5 py-2.5 ${PLATE_TITLE_STACK}`}>
            {m.form.title}
          </h2>
          <span className={cn(CELL, "whitespace-nowrap border-l border-line px-5 py-2.5 text-ink-1/70", plateCellClass(0))}>{m.form.sheet}</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] items-end gap-4 p-5">
          <div className={FIELD}>
            <label htmlFor={`${ids}-from`} className={FIELD_LABEL}>
              {m.from}
            </label>
            <input
              id={`${ids}-from`}
              className="well h-10 w-full px-2.5"
              autoCapitalize="characters"
              placeholder={m.stationPlaceholder}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className={FIELD}>
            <label htmlFor={`${ids}-to`} className={FIELD_LABEL}>
              {m.to}
            </label>
            <input
              id={`${ids}-to`}
              className="well h-10 w-full px-2.5"
              autoCapitalize="characters"
              placeholder={m.stationPlaceholder}
              aria-invalid={route === "none" || undefined}
              aria-describedby={route === "none" ? `${ids}-route` : undefined}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
          <div className={FIELD}>
            <label htmlFor={`${ids}-train`} className={FIELD_LABEL}>
              {m.train.label}
            </label>
            <NativeSelect id={`${ids}-train`} value={chosen?.trainNo ?? ""} disabled={trains.length === 0} onChange={(event) => setPicked(event.target.value)} options={trainOptions} />
          </div>
          <div className={FIELD}>
            <label htmlFor={`${ids}-cls`} className={FIELD_LABEL}>
              {m.cls}
            </label>
            <NativeSelect
              id={`${ids}-cls`}
              value={cls}
              onChange={(event) => {
                if (isClass(event.target.value)) setCls(event.target.value);
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
                if (isQuota(event.target.value)) setQuota(event.target.value);
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
              onChange={(event) => setDate(event.target.value)}
              aria-invalid={pastDate || undefined}
              aria-describedby={pastDate ? `${ids}-past` : undefined}
              className="well h-10 w-full px-2.5"
            />
          </div>
          <Button type="submit" variant="primary" className="h-10" disabled={!ready || read === "reading"}>
            {read === "reading" ? m.checking : m.submit}
          </Button>
        </div>
        {route === "none" ? (
          <p id={`${ids}-route`} className="px-5 pb-4 text-sm text-accent-soft-ink">
            {m.route.none(upperFrom, upperTo)}
          </p>
        ) : null}
        {route === "found" && chosen ? (
          <p className="px-5 pb-4 text-sm text-ink-1/70">
            {m.route.found(trains.length, upperFrom, upperTo)}{" "}
            {chosen.departs && chosen.travelTime ? m.route.detail(chosen.departs, chosen.travelTime) : null}
          </p>
        ) : null}
        {pastDate ? (
          <p id={`${ids}-past`} className="px-5 pb-4 text-sm text-accent-soft-ink">
            {m.pastDate}
          </p>
        ) : null}
      </form>

      <div role="status" aria-live="polite">
        {read === "ok" && answer ? <AvailabilityPlate answer={answer} todayIso={minDate} retrievedAt={at} sampleData={sampleData} /> : null}
        {read === "error" && asked ? (
          <div className="blueprint mt-[28px] p-6">
            <Corners />
            <h2 className="text-3xl leading-[1.12] tracking-head text-pretty">{m.result.title}</h2>
            <p className="mt-2.5 max-w-[64ch] text-body text-ink-1/78">
              {failure} {m.result.requested(asked.trainNo, asked.cls, asked.quota, asked.date)}
            </p>
            <dl className="mt-[18px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 border-t border-line pt-3.5">
              {[
                { label: m.result.responseLabel, value: m.result.responseValue },
                { label: m.result.provenanceLabel, value: m.result.provenanceValue },
                { label: m.result.fallbackLabel, value: m.result.fallbackValue },
              ].map((fact) => (
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
        <Timeline steps={steps} label={m.lifecycle} className="p-5" />
      </section>
    </>
  );
}
