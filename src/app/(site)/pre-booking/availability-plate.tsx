import { Corners } from "@/components/ui/corners";
import { PLATE_TITLE_STACK, plateCellClass } from "@/components/ui/plate";
import { stackedTable, STACKED_ROLES as R } from "@/components/ui/stacked-table";
import { statusTone } from "@/components/ui/status-tone";
import { messages } from "@/messages";
import type { AvailabilityAnswer, AvailabilityDay } from "@/services/availability-source";
import { cn } from "@/utils/cn";

// The chart, as the sheet draws it: three columns on a desk, one labelled record per date on a
// phone. Nothing here is computed from the numbers — every value is one the source sent.
//
// The waitlist pair is the change the sheet argues for. `seats` was null in all 68 rows the crawler
// collected, so a berth count cannot be the headline; what the source does give is where the queue
// opened and where it is now, which is the movement behind "will I get on".

const S = stackedTable("sm");
const EDGE = "px-3.5 first:pl-5 last:pr-5";
const HEAD = cn("legend-sm border-b border-line py-2 text-left", EDGE);
const CELL = cn("border-b border-line py-2 align-top sm:px-3.5 sm:first:pl-5 sm:last:pr-5", S.cell);
const TAG = "inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-[3px] text-2xs leading-normal tracking-head";

const m = messages.booking.availability;

/** Day, month and weekday as the site prints them, with today named rather than dated. */
function readDate(iso: string, todayIso: string): string {
  if (iso === todayIso) return `${m.today}, ${format(iso)}`;
  return format(iso);
}

function format(iso: string): string {
  const [y, mo, d] = iso.split("-").map(Number);
  if (!y || !mo || !d) return iso;
  // Assembled rather than formatted whole: en-IN's long form puts a comma before the year
  // ("Fri, 16 Oct, 2026") and the sheets draw one comma, after the weekday.
  const at = new Date(Date.UTC(y, mo - 1, d));
  const weekday = at.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
  const month = at.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
  return `${weekday}, ${d} ${month} ${y}`;
}

/**
 * One day's answer. A waitlist with both ends shows its movement; a day that cannot be booked says
 * so beside its status, because WAITLIST alone reads as a queue you may still join.
 */
function Day({ day }: { readonly day: AvailabilityDay & { readonly wlBooking: number | null; readonly wlCurrent: number | null } }) {
  const waitlisted = day.wlCurrent !== null;
  const colour = statusTone(day);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn(TAG, colour.chip)}>{day.status}</span>
        {waitlisted && day.wlBooking !== null ? (
          <>
            <span className={cn("font-data", colour.figure)}>{day.wlCurrent}</span>
            <span className="text-ink-1/70">{day.wlCurrent === day.wlBooking ? m.nobodyCleared : m.waitlistOf(day.wlBooking)}</span>
          </>
        ) : null}
        {day.canBook ? null : <span className={cn(TAG, "bg-surface-1 text-ink-2")}>{m.closed}</span>}
      </div>
      {day.canBook ? null : <div className="mt-1 text-ink-1/70">{m.closedNote}</div>}
    </>
  );
}

/**
 * `bare` drops the plate's own frame and heading.
 *
 * Inside a train row the frame would be a box around a box, and the heading would repeat a train
 * the row already names two lines above. The table itself — the four dates and what each of them
 * says — is the same either way, and is the only part a row needs.
 */
export function AvailabilityPlate({
  answer,
  todayIso,
  retrievedAt,
  sampleData,
  bare = false,
}: {
  readonly answer: AvailabilityAnswer;
  readonly todayIso: string;
  readonly retrievedAt: string;
  readonly sampleData: boolean;
  readonly bare?: boolean;
}) {
  const fare = answer.fare ? messages.booking.availability.fare(answer.fare.total) : "—";
  const Frame = bare ? "div" : "section";
  return (
    <Frame className={bare ? "" : "blueprint mt-[28px]"}>
      {/* Not hidden — absent. A hidden copy would still carry `tl02-avail`, and several open rows
          would then share one id. */}
      {bare ? null : (
        <>
          <Corners />
          <div className="flex flex-wrap items-stretch border-b border-line">
            <h2 id="tl02-avail" className={`font-display text-label font-semibold uppercase leading-6 tracking-caps text-pretty min-w-[14ch] flex-1 px-5 py-2.5 ${PLATE_TITLE_STACK}`}>
              {m.title}
            </h2>
            <span className={cn("font-display text-label font-semibold uppercase leading-6 tracking-caps whitespace-nowrap border-l border-line px-5 py-2.5 text-ink-1/70", plateCellClass(0))}>
              {m.retrieved(retrievedAt)}
            </span>
            {/* A sample answer always says so — the product's rule everywhere an answer is shown. */}
            {sampleData ? (
              <span
                title={messages.common.sampleDataHint}
                className={cn("font-display text-label font-semibold uppercase leading-6 tracking-caps whitespace-nowrap border-l border-line px-5 py-2.5 text-ink-1/70", plateCellClass(1))}
              >
                {messages.common.sampleData}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-5 py-3 text-sm">
            <span className="font-data">{answer.train.no}</span>
            <span className="text-ink-1">{answer.train.name}</span>
            <span className="text-ink-1/70">
              {answer.train.fromName} → {answer.train.toName}
            </span>
          </div>
        </>
      )}
      <div className="overflow-x-auto">
        <table role={R.table} aria-label={m.title} className={cn("tnum w-full border-collapse text-sm", S.table)}>
          <thead role={R.rowgroup} className={S.head}>
            <tr role={R.row}>
              <th role={R.columnheader} scope="col" className={HEAD}>
                {m.columns.date}
              </th>
              <th role={R.columnheader} scope="col" className={HEAD}>
                {m.columns.availability}
              </th>
              <th role={R.columnheader} scope="col" className={HEAD}>
                {m.columns.fare}
              </th>
            </tr>
          </thead>
          <tbody role={R.rowgroup} className={S.body}>
            {answer.days.map((day) => (
              <tr key={day.date} role={R.row} className={cn(S.row, "max-sm:grid-cols-3")}>
                <td role={R.cell} className={cn(CELL, S.wide, "whitespace-nowrap max-sm:font-semibold")}>
                  {readDate(day.date, todayIso)}
                </td>
                <td role={R.cell} data-label={m.columns.availability} className={cn(CELL, S.wide)}>
                  <Day day={day} />
                </td>
                <td role={R.cell} data-label={m.columns.fare} className={cn(CELL, "font-data whitespace-nowrap")}>
                  {fare}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line px-5 py-3 text-label text-ink-1/70">{m.window}</div>
    </Frame>
  );
}
