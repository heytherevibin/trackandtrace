import { ClassBlock } from "./class-block";
import { messages } from "@/messages";
import type { TrainRow } from "@/services/route-availability";
import { cn } from "@/utils/cn";

// One train in the list: its facts from the route lookup, then the classes asked for so far.
//
// Collapsed, a row carries ONE class — the one request per train the list spends — and names the
// rest without asking them. Opening it asks those and brings the other three dates, which arrived
// with the first and cost nothing more.

const m = messages.booking.list;

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
  const legs = [train.departs, train.arrives].filter(Boolean);
  const times = legs.length === 2 ? `${train.fromCode} ${train.departs} → ${train.toCode} ${train.arrives}` : `${train.fromCode} → ${train.toCode}`;
  return train.travelTime ? `${times} · ${train.travelTime}` : times;
}

export function TrainRowView({ row, last = false }: { readonly row: TrainRow; readonly last?: boolean }) {
  const runs = runsLine(row.train.runsOn);
  const asked = Object.entries(row.answers);
  const lone = asked.length === 1;
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

      {asked.length === 0 ? null : (
        <div className={cn("mt-3", lone ? "max-w-[480px]" : "grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-3")}>
          {asked.map(([cls, answer]) => (
            <ClassBlock key={cls} cls={cls} day={answer.days[0] ?? null} fareTotal={answer.fare?.total ?? null} />
          ))}
        </div>
      )}

      {row.pending.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {row.beyondCap ? null : (
            <button type="button" className="press relative inline-flex min-h-8 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap border border-line bg-transparent px-2.5 py-1 font-display text-label font-semibold leading-none text-ink-1 hover:bg-ink-1/7">
              {m.more}
            </button>
          )}
          <span className="text-label text-ink-1/70">{m.notAsked(row.pending.join(", "))}</span>
        </div>
      ) : null}
    </div>
  );
}
