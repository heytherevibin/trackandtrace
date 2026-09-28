import { Plate } from "@/components/ui/plate";
import { consoleMessages } from "@/console/messages";
import type { SourceUsage } from "@/console/sources/sources";
import type { BreakerState } from "@/services/breaker";
import type { UsageDay } from "@/services/usage";
import { cn } from "@/utils/cn";

// One plate per source (Console Sources.dc.html). A server component: there is nothing to press —
// the sheet says so in as many words, "There are no actions on this sheet".
//
// **Three fuses, not one.** The sheet draws a breaker per source; there are three, one per caller,
// because a crawler's refusals and a traveller's mean different things and each gets its own.
// Drawing one would mean choosing which to hide, and the one hidden would be the one that mattered
// on the day somebody looked.
//
// **An unknown is never drawn as a zero.** A day the store could not read is a dashed box, as the
// sheet draws it; a fuse whose state could not be read says so rather than saying "Answering". Both
// are the same rule: the absence of a reading is not a reading of none.

const m = consoleMessages.sources;

const LAMP = "inline-block size-2 shrink-0 rounded-full";
const TAG = "inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-[3px] text-2xs leading-normal tracking-head";

/** The three callers that each have their own fuse, in the order the plates draw them. */
export const FUSE_CALLERS = ["pnr", "availability", "route"] as const;

export interface Fuse {
  readonly caller: keyof typeof m.fuses.caller;
  readonly state: BreakerState;
}

/** A bar per day, scaled against the busiest. A day with no reading is drawn as an outline, never a bar. */
function History({ history, busiest }: { readonly history: readonly UsageDay[]; readonly busiest: number | null }) {
  const top = busiest !== null && busiest > 0 ? busiest : 1;
  return (
    <div className="flex items-end gap-0.5" role="img" aria-label={m.history.legend}>
      {history.map((d) => (
        <span
          key={d.day}
          title={d.requests === null ? m.history.dayUnknown(d.day) : m.history.day(d.day, d.requests)}
          className={cn(
            "w-2 shrink-0",
            // The dashed outline is the sheet's own mark for a day it has no data for. Drawn at full
            // height so it reads as "this day is unaccounted for" rather than as a very quiet one.
            d.requests === null ? "border-line h-10 border border-dashed" : "bg-accent-text/70",
          )}
          style={d.requests === null ? undefined : { height: `${Math.max(2, Math.round((d.requests / top) * 40))}px` }}
        />
      ))}
    </div>
  );
}

function FuseRow({ fuse }: { readonly fuse: Fuse }) {
  const s = fuse.state;
  const lamp = !s.known ? "bg-ink-2" : s.open ? "bg-closed-soft-ink" : "bg-open-soft-ink";
  return (
    <div className="border-line flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t py-2 first:border-t-0">
      <span className="legend-sm min-w-[12ch]">{m.fuses.caller[fuse.caller]}</span>
      <span className="flex items-center gap-2">
        <span aria-hidden className={cn(LAMP, lamp)} />
        <span className="text-sm">{!s.known ? m.fuses.unknown : s.open ? (s.retryAfterSeconds === null ? m.fuses.downUnknown : m.fuses.down(s.retryAfterSeconds)) : m.fuses.answering}</span>
      </span>
      {/* Which fuse opened is as close to WHY as the store can honestly say. */}
      {s.open && s.openedBy !== null ? <span className="text-ink-1/70 text-sm">{s.openedBy === "provider" ? m.fuses.byProvider : m.fuses.byEndpoint}</span> : null}
      {s.known && s.trips > 0 ? <span className="text-ink-1/70 font-data text-xs">{m.fuses.trips(s.trips)}</span> : null}
      {s.known && s.asks > 0 ? <span className="text-ink-1/70 font-data text-xs">{m.fuses.window(s.failures, s.asks)}</span> : null}
    </div>
  );
}

export function SourcePlate({
  usage,
  history,
  fuses,
}: {
  readonly usage: SourceUsage;
  readonly history: readonly UsageDay[];
  readonly fuses: readonly Fuse[];
}) {
  return (
    <Plate as="section" title={m.railkit.name} headingLevel={2} meta={[m.railkit.plan]} className="mt-6">
      <div className="px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span className="legend-sm">{m.today.legend}</span>
          <span className="font-data text-base">{usage.today === null ? m.today.unknown : m.today.requests(usage.today)}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <span className="legend-sm">{m.month.legend}</span>
          {usage.monthTotal === null ? (
            <span className="text-ink-1/70 text-sm">{m.today.unknown}</span>
          ) : (
            <>
              <span className="font-data text-base">{m.month.total(usage.monthTotal, m.railkit.plan)}</span>
              {usage.averagePerDay === null ? null : <span className="text-ink-1/70 text-sm">{m.month.average(usage.averagePerDay)}</span>}
            </>
          )}
        </div>

        <div className="mt-4">
          <span className="legend-sm block">{m.history.legend}</span>
          <div className="mt-2">
            <History history={history} busiest={usage.busiestDay} />
          </div>
        </div>

        <div className="mt-5">
          <span className="legend-sm block">{m.fuses.legend}</span>
          <div className="mt-1">
            {fuses.map((f) => (
              <FuseRow key={f.caller} fuse={f} />
            ))}
          </div>
        </div>

        {/* Said once, where a reader would otherwise go looking for the figures the sheet draws. */}
        <p className="text-ink-1/70 border-line mt-5 border-t pt-3 text-xs">{m.notRecorded}</p>
      </div>
    </Plate>
  );
}

export { TAG };
