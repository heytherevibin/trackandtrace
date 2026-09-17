import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { StatusPill } from "@/components/ui/status-pill";
import { messages } from "@/messages";
import type { PassengerSeat } from "@/types/domain";

/** One row per passenger, never a name. Missing allocation reads as "Not allocated". */
export function PassengerTable({ pax }: { readonly pax: readonly PassengerSeat[] }) {
  const m = messages.result.passengers;
  return (
    <Panel legend={m.legend} legendId="passengers-legend" padding="none">
      <DataTable
        caption={m.legend}
        rows={pax}
        rowKey={(p) => String(p.index)}
        columns={[
          { key: "who", header: m.passenger, cell: (p) => <span className="font-medium">{m.nth(p.index)}</span> },
          { key: "booked", header: m.booked, cell: (p) => <StatusPill status={p.bookingStatus} size="sm" /> },
          { key: "current", header: m.current, cell: (p) => <StatusPill status={p.currentStatus} position={p.position} size="sm" /> },
          { key: "allocation", header: m.allocation, cell: (p) => [p.coach, p.berth].filter(Boolean).join(" · ") || <span className="text-ink-3">{m.notAllocated}</span>, numeric: true },
        ]}
      />
    </Panel>
  );
}
