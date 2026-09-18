import { Led } from "@/components/ui/led";
import { messages } from "@/messages";
import type { ServiceStatus } from "@/services/service-status";

/** What a traveller uses, each with its state, on hairline rows. No data sets, providers or flags. */
export function ServiceList({ status }: { readonly status: ServiceStatus }) {
  const m = messages.service;
  const rows = [
    { id: "checks", name: m.components.checks, state: status.checks },
    { id: "accounts", name: m.components.accounts, state: status.accounts },
  ] as const;
  return (
    <ul aria-label={m.label} className="m-0 list-none p-0">
      {rows.map((row, index) => (
        <li key={row.id} className={`flex items-center gap-4 px-5 py-4 ${index > 0 ? "border-t border-line" : ""}`}>
          <span className="min-w-0 flex-1 font-display text-base font-semibold leading-normal tracking-head">{row.name}</span>
          <span className="inline-flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-caps text-ink-1/78">
            <Led lit={row.state === "operational"} size="sm" />
            {m.states[row.state]}
          </span>
        </li>
      ))}
    </ul>
  );
}
