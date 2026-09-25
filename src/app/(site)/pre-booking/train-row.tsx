import { AvailabilityPlate } from "./availability-plate";
import { ClassBlock } from "./class-block";
import { messages } from "@/messages";
import type { AvailabilityAnswer } from "@/services/availability-source";
import type { TrainRow } from "@/services/route-availability";
import { cn } from "@/utils/cn";

// One train in the list: its facts from the route lookup, then the classes asked for so far.
//
// Collapsed, a row carries ONE class — the one request per train the list spends — and names the
// rest without asking them. Opening it asks those and brings the other three dates, which arrived
// with the first ask and cost nothing more.

const m = messages.booking.list;

const BTN =
  "press relative inline-flex min-h-8 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap border border-line bg-transparent px-2.5 py-1 font-display text-label font-semibold leading-none text-ink-1 hover:bg-ink-1/7 disabled:cursor-not-allowed disabled:opacity-45 max-sm:h-11";

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
}

export function TrainRowView({
  row,
  leadClass,
  todayIso,
  opened,
  onOpen,
  last = false,
}: {
  readonly row: TrainRow;
  readonly leadClass: string;
  readonly todayIso: string;
  readonly opened: Opened | undefined;
  readonly onOpen: () => void;
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
  const lead = answers[leadClass] ?? Object.values(answers)[0];
  // Four dates came back with every ask, and the list shows one. Opening a row stops hiding the
  // other three, and when every chosen class is already in hand that costs NOTHING — there is
  // nothing left to request, so the button is a toggle and not a fetch.
  const hasMoreDates = (lead?.days.length ?? 0) > 1;
  const showDates = opened !== undefined && opened.phase !== "error" && hasMoreDates;
  const dates = showDates ? lead : null;
  const offer = pending.length > 0 ? m.more : hasMoreDates ? m.moreDates : null;

  return (
    <div data-testid="train-row" className={cn("px-5 py-4", last ? "" : "border-b border-line")}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-data">{row.train.trainNo}</span>
        <span className="text-ink-1">{row.train.trainName}</span>
        <span className="text-sm text-ink-1/70">{journey(row.train)}</span>
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
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(100%,260px),1fr))] gap-3">
          {asked.map(([cls, answer]) => (
            <ClassBlock key={cls} cls={cls} day={answer.days[0] ?? null} fareTotal={answer.fare?.total ?? null} />
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

      {dates ? (
        <div className="-mx-5 mt-3">
          <AvailabilityPlate answer={dates} todayIso={todayIso} retrievedAt="" sampleData={false} bare />
        </div>
      ) : null}

      {offer !== null || opened?.phase === "loading" ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* A row the cap stopped it asking is not offered an expand: the button would spend the
              request the cap exists to withhold. */}
          {row.beyondCap ? null : (
            <button type="button" className={BTN} disabled={opened !== undefined} onClick={onOpen}>
              {opened?.phase === "loading" ? m.opening : offer}
            </button>
          )}
          {pending.length > 0 ? <span className="text-label text-ink-1/70">{m.notAsked(pending.join(", "))}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
