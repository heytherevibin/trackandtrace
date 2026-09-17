import { Led } from "@/components/ui/led";
import { DataTable } from "@/components/ui/data-table";
import { messages } from "@/messages";
import { accountsConfigured, env, fixtureAllowed, flags } from "@/services/env";

type Lamp = "on" | "sample" | "off";

interface Row {
  readonly id: string;
  readonly name: string;
  readonly use: string;
  readonly state: string;
  readonly lamp: Lamp;
}

function StateCell({ lamp, text }: { readonly lamp: Lamp; readonly text: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Led lit={lamp !== "off"} tone={lamp === "sample" ? "busy" : "go"} />
      <span className="tnum">{text}</span>
    </span>
  );
}

/** What is connected right now, read from the real flags. A filled lamp is connected; a hollow one is not. Server component. */
export function SourceStatusTable() {
  const m = messages.source;
  const current = env();
  const live = flags.liveSource;
  const sample = fixtureAllowed(current);
  const accounts = accountsConfigured(current);
  const rows: readonly Row[] = [
    {
      id: "reservation",
      name: m.rows.reservation.name,
      use: m.rows.reservation.use,
      state: live ? m.states.connected : sample ? m.states.sample : m.states.notConnected,
      lamp: live ? "on" : sample ? "sample" : "off",
    },
    { id: "inventory", name: m.rows.inventory.name, use: m.rows.inventory.use, state: m.states.notConnected, lamp: "off" },
    { id: "outcomes", name: m.rows.outcomes.name, use: m.rows.outcomes.use, state: m.states.noRecords, lamp: "off" },
    { id: "accounts", name: m.rows.accounts.name, use: m.rows.accounts.use, state: accounts ? m.states.connected : m.states.notConnected, lamp: accounts ? "on" : "off" },
  ];
  return (
    <DataTable
      caption={m.table.caption}
      rows={rows}
      rowKey={(r) => r.id}
      columns={[
        { key: "name", header: m.table.dataSet, cell: (r) => <span className="font-medium">{r.name}</span> },
        { key: "use", header: m.table.usedFor, cell: (r) => <span className="text-ink-2">{r.use}</span> },
        { key: "state", header: m.table.state, cell: (r) => <StateCell lamp={r.lamp} text={r.state} /> },
      ]}
    />
  );
}
