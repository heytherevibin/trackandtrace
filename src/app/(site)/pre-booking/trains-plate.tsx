"use client";

import { useState } from "react";
import { TrainRowView, type Opened } from "./train-row";
import { orderRows, type SortKey } from "./train-order";
import { Corners } from "@/components/ui/corners";
import { PLATE_TITLE_STACK, plateCellClass } from "@/components/ui/plate";
import { messages } from "@/messages";
import type { AvailabilityAnswer } from "@/services/availability-source";
import type { RouteAvailabilityAnswer, TrainRow } from "@/services/route-availability";
import type { SourceFailure } from "@/services/sources/outcome";
import { cn } from "@/utils/cn";

// The plate the route's trains sit in, and everything the list does after the one search that
// filled it.
//
// Sorting and filtering spend nothing: every row is already in hand, and re-asking to reorder would
// pay twice for one answer. Opening a row is the only thing here that costs anything.
//
// Two things it must never do, and both are the same mistake in different clothes: render an empty
// list where a refusal belongs, and render an empty list where "no trains run this pair" belongs. A
// reader takes either for "there is nothing available", which is a third thing neither of them says.

const m = messages.booking.list;
const CELL = "font-display text-label font-semibold uppercase leading-6 tracking-caps";
// 44px on a phone, and the drawn height on a desk. Same reason as the class chips: a row of chips
// eight pixels apart leaves each coarse-pointer overlay about four pixels before its neighbour
// answers instead, so the size has to be real rather than borrowed.
// Set in caps like every other control on the sheet. `uppercase` is CSS, not copy: the accessible
// name stays "Only what I can book", so a screen reader and a test both still read the sentence.
const CHIP =
  "press relative inline-flex min-h-8 cursor-pointer select-none items-center justify-center whitespace-nowrap border px-2.5 py-1 font-display text-label font-semibold uppercase leading-none tracking-caps max-sm:h-11";
const ON = "border-accent bg-accent-soft text-accent-soft-ink";
const OFF = "border-line bg-transparent text-ink-1 hover:bg-ink-1/7";

const SORTS: readonly { readonly key: SortKey; readonly label: string }[] = [
  { key: "departure", label: m.sort.departure },
  { key: "duration", label: m.sort.duration },
  { key: "fare", label: m.sort.fare },
];

export function TrainsPlate({
  answer,
  refusal,
  sampleData,
  quota,
  todayIso = "",
}: {
  readonly answer: RouteAvailabilityAnswer | null;
  readonly refusal: SourceFailure | null;
  readonly sampleData: boolean;
  readonly quota: string;
  readonly todayIso?: string;
}) {
  const [sort, setSort] = useState<SortKey>("departure");
  const [onlyBookable, setOnlyBookable] = useState(false);
  const [opened, setOpened] = useState<Readonly<Record<string, Opened>>>({});

  function open(train: TrainRow["train"], pending: readonly string[]): void {
    const trainNo = train.trainNo;
    if (!answer) return;
    const already = opened[trainNo];
    // A row that has already been fetched costs nothing to show again, so the press is a toggle
    // from here on. The answers stay in state either way — hiding must not throw away requests
    // that were already spent, or the next press would buy them a second time.
    if (already) {
      if (already.phase === "loading") return;
      setOpened((was) => ({ ...was, [trainNo]: { ...already, shown: !already.shown } }));
      return;
    }
    // Nothing pending means nothing to ask: the other dates are already in the payload, so opening
    // the row is a toggle. Marked done without a request.
    if (pending.length === 0) {
      setOpened((was) => ({ ...was, [trainNo]: { phase: "done", answers: {}, failedClasses: [], message: "", shown: true } }));
      return;
    }
    setOpened((was) => ({ ...was, [trainNo]: { phase: "loading", answers: {}, failedClasses: [], message: "", shown: true } }));
    void (async () => {
      const failed = (message: string) => setOpened((was) => ({ ...was, [trainNo]: { phase: "error", answers: {}, failedClasses: [], message, shown: true } }));
      try {
        const res = await fetch("/api/availability", {
          method: "POST",
          headers: { "content-type": "application/json" },
          // The stations THIS train calls at, not the pair the traveller typed — the same rule the
          // fan-out follows, and for the same reason: a train asked about a pair it does not serve
          // is refused.
          body: JSON.stringify({ trainNo, from: train.fromCode, to: train.toCode, journeyDate: answer.journeyDate, quota, travelClasses: [...pending] }),
        });
        const body = (await res.json()) as {
          ok?: boolean;
          message?: string;
          answers?: Readonly<Record<string, AvailabilityAnswer>>;
          failedClasses?: readonly string[];
        };
        if (!res.ok || body.ok !== true || !body.answers) {
          failed(typeof body.message === "string" ? body.message : messages.source.availability.couldNotAnswer);
          return;
        }
        setOpened((was) => ({
          ...was,
          [trainNo]: { phase: "done", answers: body.answers ?? {}, failedClasses: body.failedClasses ?? [], message: "", shown: true },
        }));
      } catch {
        failed(messages.source.availability.couldNotAnswer);
      }
    })();
  }

  const rows = answer && !refusal ? orderRows(answer.rows, answer.leadClass, sort, onlyBookable) : [];

  return (
    <section className="blueprint mt-[28px]" aria-labelledby="tl02-trains">
      <Corners />
      <div className="flex flex-wrap items-stretch border-b border-line">
        <h2 id="tl02-trains" className={cn(CELL, "min-w-[14ch] flex-1 px-5 py-2.5 text-pretty", PLATE_TITLE_STACK)}>
          {m.title}
        </h2>
        {answer && !refusal ? (
          <span className={cn(CELL, "whitespace-nowrap border-l border-line px-5 py-2.5 text-ink-1/70", plateCellClass(0))}>
            {m.count(rows.length, answer.leadClass)}
          </span>
        ) : null}
        {/* A sample answer always says so — the product's rule everywhere an answer is shown. */}
        {sampleData ? (
          <span
            title={messages.common.sampleDataHint}
            className={cn(CELL, "whitespace-nowrap border-l border-line px-5 py-2.5 text-ink-1/70", plateCellClass(1))}
          >
            {messages.common.sampleData}
          </span>
        ) : null}
      </div>

      {refusal || !answer ? (
        <div className="px-5 py-4 text-sm text-ink-1/78">{refusal?.message ?? messages.source.availability.couldNotAnswer}</div>
      ) : answer.rows.length === 0 ? (
        <div className="px-5 py-4 text-sm text-ink-1/78">{messages.booking.route.none(answer.from, answer.to)}</div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line px-5 py-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="legend-sm" id="tl02-sort">
                {m.sort.label}
              </span>
              <div role="group" aria-labelledby="tl02-sort" className="flex flex-wrap gap-2">
                {SORTS.map(({ key, label }) => (
                  <button key={key} type="button" aria-pressed={sort === key} className={cn(CHIP, sort === key ? ON : OFF)} onClick={() => setSort(key)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {/* Says what it KEEPS, not what it hides: a reader can tell what is on screen without
                working out what left it. */}
            <button type="button" aria-pressed={onlyBookable} className={cn(CHIP, onlyBookable ? ON : OFF)} onClick={() => setOnlyBookable((was) => !was)}>
              {m.onlyBookable}
            </button>
          </div>
          {rows.map((row, i) => (
            <TrainRowView
              key={row.train.trainNo}
              row={row}
              leadClass={answer.leadClass}
              todayIso={todayIso}
              opened={opened[row.train.trainNo]}
              onOpen={() => open(row.train, row.pending)}
              last={i === rows.length - 1}
            />
          ))}
        </>
      )}
    </section>
  );
}
