import { Led } from "@/components/ui/led";
import { messages } from "@/messages";
import { accountsConfigured, env, fixtureAllowed, flags } from "@/services/env";
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
    { id: "reservation", name: m.rows.reservation.name, use: m.rows.reservation.use, state: live ? m.states.connected : sample ? m.states.sample : m.states.notConnected, connected: live },
    { id: "inventory", name: m.rows.inventory.name, use: m.rows.inventory.use, state: m.states.notConnected, connected: false },
    { id: "outcomes", name: m.rows.outcomes.name, use: m.rows.outcomes.use, state: m.states.noRecords, connected: false },
    { id: "accounts", name: m.rows.accounts.name, use: m.rows.accounts.use, state: accounts ? m.states.connected : m.states.notConnected, connected: accounts },
  ];
}

/**
 * What is connected right now, read from the real flags. Server component.
 * "board" is the landing's sources board (13px heads, 12×24 cells, a lamp per state);
 * "ledger" is the accuracy page's table (12px heads, 11×20 cells, state in capitals).
 */
export function SourceStatusTable({ variant = "board" }: { readonly variant?: "board" | "ledger" }) {
  const m = messages.source.table;
  const board = variant === "board";
  const th = cn("border-b border-line text-left font-display font-semibold uppercase tracking-caps text-ink-3", board ? "px-6 py-3 text-label" : "px-5 py-3 text-xs leading-normal");
  const td = cn("border-b border-line", board ? "px-6 py-3" : "px-5 py-[11px]");
  return (
    <div className="overflow-x-auto" role="region" aria-label={m.caption} tabIndex={0}>
      <table className="w-full min-w-[560px] border-collapse text-body leading-normal">
        <caption className="sr-only">{m.caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={th}>
              {m.dataSet}
            </th>
            <th scope="col" className={th}>
              {m.usedFor}
            </th>
            <th scope="col" className={th}>
              {m.state}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows().map((r) => (
            <tr key={r.id}>
              <td className={cn(td, "font-medium")}>{r.name}</td>
              <td className={cn(td, "text-ink-1/74")}>{r.use}</td>
              {board ? (
                <td className={td}>
                  <span className="inline-flex items-center gap-2.5">
                    <Led lit={r.connected} />
                    <span className="tnum">{r.state}</span>
                  </span>
                </td>
              ) : (
                <td className={cn(td, "font-display text-label font-semibold uppercase tracking-brand text-ink-3")}>{r.state}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
