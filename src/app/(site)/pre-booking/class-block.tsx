import { statusTone } from "@/components/ui/status-tone";
import { messages } from "@/messages";
import type { AvailabilityDayRecord } from "@/services/availability-source";
import { cn } from "@/utils/cn";

// One class on one date, in the order a traveller actually asks:
//
//   1. the answer — the status and the queue, at reading size
//   2. the price  — the class and its fare, in the quiet voice
//   3. the history — how often that queue has cleared
//
// "Will I get on" comes before "what does it cost". An earlier draft led with the fare, which put
// the second question above the first.

const TAG = "inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-[3px] text-2xs leading-normal tracking-head";

const m = messages.booking.availability;

export function ClassBlock({
  cls,
  day,
  fareTotal,
  notCarried = false,
}: {
  readonly cls: string;
  readonly day: AvailabilityDayRecord | null;
  readonly fareTotal: number | null;
  readonly notCarried?: boolean;
}) {
  const colour = day ? statusTone(day) : null;
  const fare = fareTotal === null ? "—" : m.fare(fareTotal);
  return (
    <div data-testid="class-block" className="border border-line px-3 py-2.5">
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        {notCarried || !day || !colour ? (
          <span className="text-ink-1/70">{messages.booking.list.notCarried}</span>
        ) : (
          <>
            <span className={cn(TAG, colour.chip)}>{day.status}</span>
            {/* The queue as now against where it opened. Both ends or neither: "44" alone says
                nothing about whether 44 is near the front, and the pair is what the source gives. */}
            {day.wlCurrent === null || day.wlBooking === null ? null : (
              <span className={cn("font-data text-lg leading-none", colour.figure)}>
                {day.wlCurrent}/{day.wlBooking}
              </span>
            )}
          </>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-2">
        <span className="legend-sm">{cls}</span>
        <span className="font-data text-ink-1/70">{fare}</span>
      </div>
      {/* The store has the column for this and nothing writes it yet, so it says so rather than
          showing a number nobody has measured. It is drawn now so filling it is not a re-layout. */}
      {day && day.wlCurrent !== null ? <div className="mt-1 text-label text-ink-1/70">{messages.booking.list.noHistory}</div> : null}
    </div>
  );
}
