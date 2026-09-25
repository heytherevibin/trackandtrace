"use client";

import { useEffect, useId, useState, useSyncExternalStore, type FormEvent } from "react";
import { lifecycleSteps, type ReadPhase, type RoutePhase } from "./availability-lifecycle";
import { TrainsPlate } from "./trains-plate";
import { ClassChips, inOrder } from "@/components/pre-booking/class-chips";
import { Button } from "@/components/ui/button";
import { Corners } from "@/components/ui/corners";
import { NativeSelect } from "@/components/ui/native-select";
import { PLATE_TITLE_STACK, plateCellClass } from "@/components/ui/plate";
import { Timeline } from "@/components/ui/timeline";
import { messages } from "@/messages";
import type { RouteAvailabilityAnswer } from "@/services/route-availability";
import type { RouteTrain } from "@/services/route-source";
import type { SourceFailure } from "@/services/sources/outcome";
import { QUOTA_VALUES, type FormClass, type FormQuota } from "@/types/booking";
import { cn } from "@/utils/cn";

// Form TL-02 v2, transcribed from the Claude Design sheet "Pre-booking Trains List".
//
// Stations first, and the train is not chosen at all: the source has no train-to-route lookup, and
// availability exists only per train per class, so the only question that can be asked is "which
// trains run this pair, and what does each of them say". See `route-availability-query.ts`.
//
// Nothing is estimated here and no train is ever invented. A search that could not be made renders
// a refusal — there is no branch that draws a list with nothing in it.

const CELL = "font-display text-label font-semibold uppercase leading-6 tracking-caps text-pretty";
const FIELD_LABEL = "font-display text-xs font-semibold uppercase leading-normal tracking-caps text-accent-text";
const FIELD = "flex min-w-0 flex-col gap-1.5";

const DEFAULT_CLASSES: readonly FormClass[] = ["SL", "3A", "2A"];
const STATION = /^[A-Za-z]{2,5}$/;
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
  readonly classes: readonly string[];
  readonly quota: FormQuota;
  readonly date: string;
}

export function PreBookingForm() {
  const m = messages.booking;
  const ids = useId();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [lookup, setLookup] = useState<{ readonly key: string; readonly phase: RoutePhase; readonly trains: readonly RouteTrain[] }>({ key: "", phase: "idle", trains: [] });
  const [classes, setClasses] = useState<readonly FormClass[]>(DEFAULT_CLASSES);
  const [quota, setQuota] = useState<FormQuota>("GN");
  const [date, setDate] = useState("");
  const [asked, setAsked] = useState<Asked | null>(null);
  const [read, setRead] = useState<ReadPhase>("idle");
  const [answer, setAnswer] = useState<RouteAvailabilityAnswer | null>(null);
  const [refusal, setRefusal] = useState<SourceFailure | null>(null);
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
          const body = (await res.json()) as { ok?: boolean; trains?: readonly RouteTrain[] };
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

  // A pair the railway has no trains for is a complete answer already. Searching it would spend a
  // request to learn nothing, so the button is not offered.
  const ready = route === "found" && date.length > 0 && !pastDate && classes.length > 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) return;
    const ordered = inOrder(classes);
    setAsked({ classes: ordered, quota, date });
    setRead("reading");
    setAnswer(null);
    setRefusal(null);
    void (async () => {
      try {
        const res = await fetch("/api/route-availability", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ from: upperFrom, to: upperTo, journeyDate: date, quota, classes: ordered }),
        });
        const body = (await res.json()) as { ok?: boolean; message?: string; code?: string; sampleData?: boolean } & Partial<RouteAvailabilityAnswer>;
        if (!res.ok || body.ok !== true || !Array.isArray(body.rows)) {
          setRefusal({
            ok: false,
            code: "SOURCE_UNAVAILABLE",
            message: typeof body.message === "string" ? body.message : messages.source.availability.couldNotAnswer,
          });
          setRead("error");
          return;
        }
        setSampleData(body.sampleData === true);
        setAnswer(body as RouteAvailabilityAnswer);
        setRead("ok");
      } catch {
        setRefusal({ ok: false, code: "SOURCE_UNAVAILABLE", message: messages.source.availability.couldNotAnswer });
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
    trains: trains.length,
    asked,
    rows: answer?.rows.length ?? 0,
    at,
    hasDate: date.length > 0,
  });

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
              className="well h-10 w-full px-2.5 uppercase"
              autoCapitalize="characters"
              placeholder={m.stationPlaceholder}
              value={from}
              onChange={(event) => setFrom(event.target.value.toUpperCase())}
            />
          </div>
          <div className={FIELD}>
            <label htmlFor={`${ids}-to`} className={FIELD_LABEL}>
              {m.to}
            </label>
            <input
              id={`${ids}-to`}
              className="well h-10 w-full px-2.5 uppercase"
              autoCapitalize="characters"
              placeholder={m.stationPlaceholder}
              aria-invalid={route === "none" || undefined}
              aria-describedby={route === "none" ? `${ids}-route` : undefined}
              value={to}
              onChange={(event) => setTo(event.target.value.toUpperCase())}
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
        </div>
        {/* One row, not a stacked block: the label sits inline with the chips and the submit closes
            the row. Stacked, the label opened a second rhythm inside a form that already has one,
            and seven short chips left two thirds of the band empty. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line px-5 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
            <span id={`${ids}-cls`} className={FIELD_LABEL}>
              {m.cls}
            </span>
            <ClassChips value={classes} onChange={setClasses} labelledBy={`${ids}-cls`} />
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
        {route === "found" ? <p className="px-5 pb-4 text-sm text-ink-1/70">{m.route.found(trains.length, upperFrom, upperTo)}</p> : null}
        {pastDate ? (
          <p id={`${ids}-past`} className="px-5 pb-4 text-sm text-accent-soft-ink">
            {m.pastDate}
          </p>
        ) : null}
      </form>

      <div role="status" aria-live="polite">
        {read === "ok" || read === "error" ? <TrainsPlate answer={answer} refusal={refusal} sampleData={sampleData} quota={asked?.quota ?? quota} todayIso={minDate} /> : null}
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
