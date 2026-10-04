import type { ReactNode } from "react";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.leads;

/**
 * The page header both Leads pages share (ConsoleLeads.dc.html): kicker, title, lead, the "Updated"
 * line and the header's buttons. No-access draws it without the line or a button.
 *
 * `action` is the buttons: Add a business lead, and on Lifecycle Export CSV for the roles that have
 * it. A phone draws none of them; `phoneNote` is the line the phone board puts there instead.
 */
export function LeadsHeader({ updated, action, phoneNote }: { readonly updated?: string; readonly action?: ReactNode; readonly phoneNote?: string }) {
  return (
    <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <span className="legend-sm text-accent-text">{m.kicker}</span>
        <h1 className="optical-hang tracking-head mt-2 text-4xl">{m.title}</h1>
        <p className="text-ink-1/70 mt-2 max-w-[56ch]">{m.lead}</p>
        {updated ? <p className="legend mt-3">{m.updated(updated)}</p> : null}
        {phoneNote ? <p className="text-ink-3 text-label mt-3 sm:hidden">{phoneNote}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-3 max-sm:hidden">{action}</div> : null}
    </header>
  );
}
