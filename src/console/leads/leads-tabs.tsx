import Link from "next/link";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { cn } from "@/utils/cn";

const m = consoleMessages.leads.business.tabs;

/** The Business pipeline's own address: the board, with a lead's record over it when one is named. */
export const PIPELINE_HREF = consoleHref("/leads/pipeline");

const TABS = [
  { key: "lifecycle", href: consoleHref("/leads"), label: m.lifecycle },
  { key: "pipeline", href: PIPELINE_HREF, label: m.pipeline },
] as const;

/**
 * Lifecycle and Business pipeline (ConsoleLeads.dc.html, under the page header), in the look of the
 * Announcements tabs and for the reason given there: the sheet draws a tablist, and these are two
 * links in a `<nav>` with `aria-current`, because each is its own address with its own server read
 * and a tablist promises panels swapped in place.
 *
 * Full width with 44px cells below `sm`, as the phone board draws its `tabs-lg`.
 */
export function LeadsTabs({ current }: { readonly current: "lifecycle" | "pipeline" }) {
  return (
    <nav aria-label={m.label} className="border-line mt-6 inline-flex self-start border max-sm:flex">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          prefetch={false}
          aria-current={tab.key === current ? "page" : undefined}
          className={cn(
            "press font-display text-2xs tracking-caps not-first:border-line inline-flex h-8 items-center justify-center px-3 font-semibold uppercase no-underline outline-none not-first:border-l max-sm:h-11 max-sm:flex-1",
            tab.key === current ? "bg-accent/16 text-accent-text" : "text-ink-3 hover:bg-accent/12",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
