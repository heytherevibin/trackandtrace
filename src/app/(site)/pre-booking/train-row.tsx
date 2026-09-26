import { useState } from "react";
import { AvailabilityPlate } from "./availability-plate";
import { ClassBlock } from "./class-block";
import { TrainRoutePopover } from "./train-route-strip";
import { messages } from "@/messages";
import type { AvailabilityAnswer, AvailabilityDayRecord } from "@/services/availability-source";
import type { TrainRow } from "@/services/route-availability";
import { cn } from "@/utils/cn";

// One train in the list: its facts from the route lookup, then the classes asked for so far.
//
// Collapsed, a row carries ONE class — the one request per train the list spends — and names the
// rest without asking them. Opening it asks those and brings the other three dates, which arrived
// with the first ask and cost nothing more.

const m = messages.booking.list;

const BTN =
  "press relative inline-flex min-h-8 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap border border-line bg-transparent px-2.5 py-1 font-display text-label font-semibold uppercase leading-none tracking-caps text-ink-1 hover:bg-ink-1/7 disabled:cursor-not-allowed disabled:opacity-45 max-sm:h-11";

/**
 * How many days a week, never which ones.
 *
 * The provider's mask is seven flags and **which flag is which weekday is not verified**. A count
 * needs no calendar; a name would be a guess printed as a fact.
 */
function runsLine(runsOn: readonly boolean[] | null): string | null {
  if (!runsOn) return null;
  const days = runsOn.filter(Boolean).length;
  return days === 0 ? null : m.runsDays(days);
}

function journey(train: TrainRow["train"]): string {
  const timed = train.departs !== null && train.arrives !== null;
  const times = timed ? `${train.fromCode} ${train.departs} → ${train.toCode} ${train.arrives}` : `${train.fromCode} → ${train.toCode}`;
  return train.travelTime ? `${times} · ${train.travelTime}` : times;
}

/** What opening the row has produced so far, if it has been opened. */
export interface Opened {
  readonly phase: "loading" | "done" | "error";
  readonly answers: Readonly<Record<string, AvailabilityAnswer>>;
  readonly failedClasses: readonly string[];
  readonly message: string;
  /**
   * Whether the dates are currently drawn.
   *
   * Separate from "has been opened" so collapsing keeps what was fetched. The button used to be
   * one-shot — it was a FETCH, and a second press would have spent the requests again — but every
   * chosen class now arrives with the search, so pressing it is only showing and hiding rows
   * already in hand. A control that greys out after one press, having cost nothing, reads as broken.
   */
  readonly shown: boolean;
  /**
   * Days 5–8 for a class, fetched only when a reader presses for them.
   *
   * Keyed by class because they are bought one class at a time: one ask buys four days for ONE
   * class of ONE train, so asking for every chosen class would be three requests for a press that
   * looks like one.
   */
  readonly extraDays?: Readonly<Record<string, readonly AvailabilityDayRecord[]>>;
  /** Which class is being fetched right now, so only that button says it is working. */
  readonly loadingDatesFor?: string | null;
  readonly datesFailedFor?: string | null;
}

export function TrainRowView({
  row,
  leadClass,
  todayIso,
  opened,
  onOpen,
  onMoreDates,
  last = false,
}: {
  readonly row: TrainRow;
  readonly leadClass: string;
  readonly todayIso: string;
  readonly opened: Opened | undefined;
  readonly onOpen: () => void;
  /** Buy the four days after `lastDate` for one class. The only press on this row that costs a request. */
  readonly onMoreDates: (cls: string, lastDate: string) => void;
  readonly last?: boolean;
}) {
  const runs = runsLine(row.train.runsOn);
  // The row arrives from the wire through a cast, so a field a older deployment did not send is
  // `undefined` at runtime whatever the type says. One `??` here is cheaper than a blank page.
  const notCarried = row.notCarried ?? [];
  const answers = { ...row.answers, ...(opened?.answers ?? {}) };
  const asked = Object.entries(answers);
  // A class that came back on the expand is no longer pending; one that failed there is named on
  // its own line rather than dropped back into "not asked", which would be a different claim.
  const pending = row.pending.filter((cls) => !(cls in answers) && !(opened?.failedClasses ?? []).includes(cls));
  // Which class the date table is for. Unset until the reader picks one, and then it is theirs —
  // the lead is only the default, and a row where every class answered has four equal candidates.
  const [picked, setPicked] = useState<string | null>(null);
  const pickable = picked !== null && picked in answers ? picked : leadClass in answers ? leadClass : (Object.keys(answers)[0] ?? null);
  const found = pickable === null ? undefined : answers[pickable];
  // The four days the search bought, plus any later window a reader has since asked for. Appended
  // rather than replacing: the first four are already on screen and must not move under them.
  const extra = (pickable === null ? undefined : opened?.extraDays?.[pickable]) ?? [];
  const lead = found && extra.length > 0 ? { ...found, days: [...found.days, ...extra] } : found;
  // Four dates came back with every ask, and the list shows one. Opening a row stops hiding the
  // other three, and when every chosen class is already in hand that costs NOTHING — there is
  // nothing left to request, so the button is a toggle and not a fetch.
  const hasMoreDates = (lead?.days.length ?? 0) > 1;
  const showDates = opened !== undefined && opened.shown && opened.phase !== "error" && hasMoreDates;
  const dates = showDates ? lead : null;
  const offer = showDates ? m.fewerDates : pending.length > 0 ? m.more : hasMoreDates ? m.moreDates : null;
  // The cards only become choices once there is a table for them to steer.
  const choosing = showDates && asked.length > 1;

  return (
    <div data-testid="train-row" className={cn("px-5 py-4", last ? "" : "border-b border-line")}>
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-data">{row.train.trainNo}</span>
          <span className="text-ink-1">{row.train.trainName}</span>
          <span className="text-sm text-ink-1/70">{journey(row.train)}</span>
        </div>
        {/* The run, in the corner. Costs nothing: every field it uses arrived with the search. */}
        <TrainRoutePopover train={row.train} className="shrink-0" />
      </div>
      {runs ? <div className="mt-1 text-label text-ink-1/70">{runs}</div> : null}

      {/* Asked and refused is not the same as never asked, and must not borrow its words. */}
      {row.failed ? <div className="mt-3 text-sm text-ink-1/70">{m.trainFailed}</div> : null}
      {/* Nor is "we could not ask" the same as "the railway says no". This one is an answer. */}
      {row.notBookable ? <div className="mt-3 text-sm text-ink-1/70">{m.trainNotBookable}</div> : null}

      {/* One grid, always, with the tracks KEPT rather than collapsed.
          `auto-fit` would give a single block the whole row, so the collapsed state was held to a
          fixed 480px — a number that matched no track at any width, and read wider than the
          three-up it is meant to look like. `auto-fill` keeps the empty tracks, so one block is
          exactly one column and stays that width as more arrive. */}
      {asked.length === 0 && notCarried.length === 0 ? null : (
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(100%,150px),1fr))] gap-2">
          {asked.map(([cls, answer]) => (
            <ClassBlock
              key={cls}
              cls={cls}
              day={answer.days[0] ?? null}
              fareTotal={answer.fare?.total ?? null}
              selected={choosing ? cls === pickable : undefined}
              onSelect={choosing ? () => setPicked(cls) : undefined}
            />
          ))}
          {/* Drawn, not omitted. A class left out reads as one nobody asked about; this one WAS
              asked, and the train's answer is that it does not carry it. */}
          {notCarried.map((cls) => (
            <ClassBlock key={cls} cls={cls} day={null} fareTotal={null} notCarried />
          ))}
        </div>
      )}

      {(opened?.failedClasses ?? []).length > 0 ? (
        <div className="mt-2 text-label text-ink-1/70">{m.classFailed((opened?.failedClasses ?? []).join(", "))}</div>
      ) : null}
      {opened?.phase === "error" ? <div className="mt-2 text-sm text-ink-1/78">{opened.message}</div> : null}

      {dates && pickable ? (
        <div className="mt-3">
          {/* Captioned, always. The fares repeat down the column, so a table read as the wrong class
              looks perfectly consistent — there is nothing in it to catch the mistake. */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="legend-sm">{m.datesFor(pickable)}</span>
            {choosing ? <span className="text-label text-ink-1/70">{m.pickClassForDates}</span> : null}
          </div>
          <div className="-mx-5 mt-2">
            <AvailabilityPlate answer={dates} todayIso={todayIso} retrievedAt="" sampleData={false} bare />
          </div>
          {/* The one control here that spends a request. Offered only once per class, because a
              second press would buy days nine to twelve and nobody asked for a fortnight. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            {extra.length > 0 ? (
              <span className="text-label text-ink-1/70">{m.nextDatesDone(dates.days.length)}</span>
            ) : (
              <button
                type="button"
                className={BTN}
                disabled={opened?.loadingDatesFor === pickable}
                onClick={() => onMoreDates(pickable, dates.days[dates.days.length - 1]?.date ?? "")}
              >
                {opened?.loadingDatesFor === pickable ? m.nextDatesLoading : m.nextDates}
              </button>
            )}
            {opened?.datesFailedFor === pickable ? <span className="text-label text-ink-1/70">{m.nextDatesFailed}</span> : null}
          </div>
        </div>
      ) : null}

      {offer !== null || opened?.phase === "loading" ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* A row the cap stopped it asking is not offered an expand: the button would spend the
              request the cap exists to withhold. */}
          {/* Disabled only while a request is actually in flight. Once the rows are in hand the
              press costs nothing, so it stays live and reads "Hide dates" on the way back. */}
          {row.beyondCap ? null : (
            <button type="button" className={BTN} aria-expanded={showDates} disabled={opened?.phase === "loading"} onClick={onOpen}>
              {opened?.phase === "loading" ? m.opening : offer}
            </button>
          )}
          {pending.length > 0 ? <span className="text-label text-ink-1/70">{m.notAsked(pending.join(", "))}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
