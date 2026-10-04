import type { ReactNode } from "react";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.announcements;

/**
 * The page header every Announcements view shares (ConsoleAnnouncements.dc.html:70-82): kicker,
 * title, lead, the "Updated" line and one action. No-access draws it without the line or an action.
 */
export function AnnouncementsHeader({ updated, action }: { readonly updated?: string; readonly action?: ReactNode }) {
  return (
    <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <span className="legend-sm text-accent-text">{m.kicker}</span>
        <h1 className="optical-hang tracking-head mt-2 text-4xl">{m.title}</h1>
        <p className="text-ink-1/70 mt-2 max-w-[56ch]">{m.lead}</p>
        {updated ? <p className="legend mt-3">{m.updated(updated)}</p> : null}
      </div>
      {action ? <div className="max-sm:w-full [&>a]:max-sm:w-full [&>a]:max-sm:justify-center">{action}</div> : null}
    </header>
  );
}
