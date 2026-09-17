import { Led } from "@/components/ui/led";
import { DataTable } from "@/components/ui/data-table";
import { messages } from "@/messages";
import { accountsConfigured, env, fixtureAllowed, flags } from "@/services/env";
import type { Tone } from "@/types/ui";

interface Row {
  readonly id: string;
  readonly name: string;
  readonly use: string;
  readonly state: string;
  readonly tone: Tone;
}

function StateCell({ tone, text }: { readonly tone: Tone; readonly text: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Led tone={tone} lit />
      <span>{text}</span>
    </span>
  );
}

/** What is connected right now, read from the real flags. Server component. */
export function SourceStatusTable() {
  const m = messages.source;
  const current = env();
  const live = flags.liveSource;
  const sample = fixtureAllowed(current);
  const rows: readonly Row[] = [
    {
      id: "reservation",
      name: m.rows.reservation.name,
      use: m.rows.reservation.use,
      state: live ? m.states.connected : sample ? m.states.sample : m.states.notConnected,
      tone: live ? "go" : "watch",
    },
    { id: "inventory", name: m.rows.inventory.name, use: m.rows.inventory.use, state: m.states.notConnected, tone: "watch" },
    { id: "outcomes", name: m.rows.outcomes.name, use: m.rows.outcomes.use, state: m.states.noRecords, tone: "watch" },
    {
      id: "accounts",
      name: m.rows.accounts.name,
      use: m.rows.accounts.use,
      state: accountsConfigured(current) ? m.states.connected : m.states.notConnected,
      tone: accountsConfigured(current) ? "go" : "watch",
    },
  ];
  return (
    <DataTable
      caption={m.table.caption}
      rows={rows}
      rowKey={(r) => r.id}
      columns={[
        { key: "name", header: m.table.dataSet, cell: (r) => <span className="font-medium">{r.name}</span> },
        { key: "use", header: m.table.usedFor, cell: (r) => <span className="text-ink-2">{r.use}</span> },
        { key: "state", header: m.table.state, cell: (r) => <StateCell tone={r.tone} text={r.state} /> },
      ]}
    />
  );
}
