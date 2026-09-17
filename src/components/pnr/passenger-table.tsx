import { Plate } from "@/components/ui/plate";
import { messages } from "@/messages";
import type { PassengerSeat, TicketStatus } from "@/types/domain";
import { cn } from "@/utils/cn";

// The terminal's passenger table on a plate of its own: 11px capital heads, 14px
// cells on hairline rows, the current status in the heavier weight. Outer cells
// sit on the header's 20px edge; inner gutters keep the drawn 14px.

const EDGE = "px-3.5 first:pl-5 last:pr-5";
const HEAD = cn("legend-sm border-b border-line py-2 text-left", EDGE);
const CELL = cn("border-b border-line py-2 align-top", EDGE);

function code(status: TicketStatus, position?: number): string {
  const codes = messages.result.passengers.codes;
  if ((status === "RAC" || status === "WL") && typeof position === "number") return messages.status.withPosition(status, position);
  return codes[status];
}

/** One row per passenger, never a name. Missing allocation reads as "Not allocated". */
export function PassengerTable({ pax, className }: { readonly pax: readonly PassengerSeat[]; readonly className?: string }) {
  const m = messages.result.passengers;
  return (
    <Plate title={m.legend} titleId="passengers-title" headingLevel={2} meta={[m.count(pax.length)]} cells="tight" padding="none" className={className}>
      <div className="overflow-x-auto">
        <table className="tnum w-full border-collapse text-sm" aria-labelledby="passengers-title">
          <thead>
            <tr>
              <th scope="col" className={HEAD}>
                {m.passenger}
              </th>
              <th scope="col" className={HEAD}>
                {m.booked}
              </th>
              <th scope="col" className={HEAD}>
                {m.current}
              </th>
              <th scope="col" className={HEAD}>
                {m.allocation}
              </th>
            </tr>
          </thead>
          <tbody>
            {pax.map((p) => (
              <tr key={p.index}>
                <td className={cn(CELL, "whitespace-nowrap")}>{m.nth(p.index)}</td>
                <td className={cn(CELL, "text-ink-1/70")}>{code(p.bookingStatus)}</td>
                <td className={cn(CELL, "whitespace-nowrap font-semibold")}>{code(p.currentStatus, p.position)}</td>
                <td className={CELL}>{[p.coach, p.berth].filter(Boolean).join(" · ") || m.notAllocated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Plate>
  );
}
