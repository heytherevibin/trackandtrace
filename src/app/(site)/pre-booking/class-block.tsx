import { statusTone } from "@/components/ui/status-tone";
import { messages } from "@/messages";
import type { AvailabilityDayRecord } from "@/services/availability-source";
import { cn } from "@/utils/cn";

// One class on one date, in the order a traveller actually asks:
//
//   1. the answer — the status and the queue, at reading size
//   2. the price  — the class and its fare, in the quiet voice
//
// "Will I get on" comes before "what does it cost". An earlier draft led with the fare, which put
// the second question above the first.
//
// **Two lines, not three.** A row carries every chosen class now, so four of these stack up on one
// train and every line is paid for four times over. The third line was "Not enough history yet" —
// a sentence that says nothing, on every card, for every train, sixteen times on a five-train
// list. It comes back when something writes `availability_observations.outcome` and it has a
// number to show; drawn empty it was only taking the room the answer needed.
//
// The ORDER is unchanged and is not a layout decision: the answer, then the price.
//
// When the row is open the card becomes a BUTTON that picks which class the date table below is
// showing, because a table of four possible classes with no caption is a guess.

const TAG = "inline-flex items-center whitespace-nowrap px-2 py-px text-2xs leading-normal tracking-head";

const m = messages.booking.availability;

function Body({ cls, day, fareTotal, notCarried }: { readonly cls: string; readonly day: AvailabilityDayRecord | null; readonly fareTotal: number | null; readonly notCarried: boolean }) {
  const colour = day ? statusTone(day) : null;
  const fare = fareTotal === null ? "—" : m.fare(fareTotal);
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {notCarried || !day || !colour ? (
          <span className="text-2xs text-ink-1/70">{messages.booking.list.notCarried}</span>
        ) : (
          <>
            <span className={cn(TAG, colour.chip)}>{day.status}</span>
            {/* The queue as now against where it opened. Both ends or neither: "44" alone says
                nothing about whether 44 is near the front, and the pair is what the source gives. */}
            {day.wlCurrent !== null && day.wlBooking !== null ? (
              <span className={cn("font-data text-base leading-none", colour.figure)}>
                {day.wlCurrent}/{day.wlBooking}
              </span>
            ) : day.seats !== null ? (
              // The berth count the railway published. Not a forecast — the one number on this card
              // that says how much room is actually left.
              <span className={cn("font-data text-base leading-none", colour.figure)}>{m.seatsFree(day.seats)}</span>
            ) : null}
          </>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
        <span className="legend-sm">{cls}</span>
        <span className="font-data text-xs text-ink-1/70">{fare}</span>
        {/* WAITLIST alone reads as a queue you may still join. When the source says you cannot, the
            card has to say so — the status word and its colour do not carry it. */}
        {day && !day.canBook ? <span className="text-2xs text-ink-1/70">{m.closed}</span> : null}
      </div>
    </>
  );
}

export function ClassBlock({
  cls,
  day,
  fareTotal,
  notCarried = false,
  selected,
  onSelect,
}: {
  readonly cls: string;
  readonly day: AvailabilityDayRecord | null;
  readonly fareTotal: number | null;
  readonly notCarried?: boolean;
  /** Set only while the row is open: the card is then a choice, and one of them is the chosen one. */
  readonly selected?: boolean;
  readonly onSelect?: () => void;
}) {
  const body = <Body cls={cls} day={day} fareTotal={fareTotal} notCarried={notCarried} />;
  // A class with no day has no dates to show, so it never becomes a button: an inert control that
  // looks like a choice is worse than no choice.
  if (!onSelect || !day) {
    return (
      <div data-testid="class-block" className="border border-line px-2.5 py-2">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      data-testid="class-block"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "press block w-full cursor-pointer border px-2.5 py-2 text-left hover:bg-ink-1/7",
        selected ? "border-ink-1/45 bg-ink-1/7" : "border-line",
      )}
    >
      {body}
    </button>
  );
}
