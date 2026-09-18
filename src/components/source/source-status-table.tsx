import { Led } from "@/components/ui/led";
import { STACKED_ROLES as R, stackedTable } from "@/components/ui/stacked-table";
import { messages } from "@/messages";
import { accountsConfigured, activePnrSource, env, fixtureAllowed, flags } from "@/services/env";
import { cn } from "@/utils/cn";

interface Row {
  readonly id: string;
  readonly name: string;
  readonly use: string;
  readonly state: string;
  readonly connected: boolean;
}

function rows(): readonly Row[] {
  const m = messages.source;
  const current = env();
  const live = flags.liveSource;
  const sample = fixtureAllowed(current);
  const accounts = accountsConfigured(current);
  return [
    {
      id: "reservation",
      name: m.rows.reservation.name,
      use: m.rows.reservation.use,
      state: sample ? m.states.sample : activePnrSource(current) === "rapidapi" ? m.states.thirdParty : live ? m.states.connected : m.states.notConnected,
      connected: live,
    },
    { id: "inventory", name: m.rows.inventory.name, use: m.rows.inventory.use, state: m.states.notConnected, connected: false },
    { id: "outcomes", name: m.rows.outcomes.name, use: m.rows.outcomes.use, state: m.states.noRecords, connected: false },
    { id: "accounts", name: m.rows.accounts.name, use: m.rows.accounts.use, state: accounts ? m.states.connected : m.states.notConnected, connected: accounts },
  ];
}

const S = stackedTable("sm");

/**
 * What is connected right now, read from the real flags. Server component. On a phone each data set
 * folds into a record: its name across the top, "Used for" and "State" labelled beneath.
 * "board" is the landing's sources board (13px heads, 12×24 cells, a lamp per state);
 * "ledger" is the accuracy page's table (12px heads, 11×20 cells, state in capitals).
 */
export function SourceStatusTable({ variant = "board" }: { readonly variant?: "board" | "ledger" }) {
  const m = messages.source.table;
  const board = variant === "board";
  const th = cn("border-b border-line text-left font-display font-semibold uppercase tracking-caps text-ink-3", board ? "px-6 py-3 text-label" : "px-5 py-3 text-xs leading-normal");
  const td = cn("border-b border-line", board ? "px-6 py-3" : "px-5 py-[11px]", S.cell);
  return (
    <div className="overflow-x-auto" role="region" aria-label={m.caption} tabIndex={0}>
      <table role={R.table} className={cn("w-full border-collapse text-body leading-normal sm:min-w-[560px]", S.table)}>
        <caption className="sr-only">{m.caption}</caption>
        <thead role={R.rowgroup} className={S.head}>
          <tr role={R.row}>
            <th role={R.columnheader} scope="col" className={th}>
              {m.dataSet}
            </th>
            <th role={R.columnheader} scope="col" className={th}>
              {m.usedFor}
            </th>
            <th role={R.columnheader} scope="col" className={th}>
              {m.state}
            </th>
          </tr>
        </thead>
        <tbody role={R.rowgroup} className={S.body}>
          {rows().map((r) => (
            <tr key={r.id} role={R.row} className={cn(S.row, "max-sm:grid-cols-2")}>
              <td role={R.cell} className={cn(td, S.wide, "font-medium")}>
                {r.name}
              </td>
              <td role={R.cell} data-label={m.usedFor} className={cn(td, "text-ink-1/74")}>
                {r.use}
              </td>
              {board ? (
                <td role={R.cell} data-label={m.state} className={td}>
                  <span className="inline-flex items-center gap-2.5">
                    <Led lit={r.connected} />
                    <span className="tnum">{r.state}</span>
                  </span>
                </td>
              ) : (
                <td role={R.cell} data-label={m.state} className={cn(td, "font-display text-label font-semibold uppercase tracking-brand text-ink-3")}>
                  {r.state}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
