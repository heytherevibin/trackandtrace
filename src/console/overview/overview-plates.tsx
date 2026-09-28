import Link from "next/link";
import { Plate } from "@/components/ui/plate";
import type { AuditEntry } from "@/console/audit/audit";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { auditWhen, type Lamp, type MonthQuota, type ServiceRow } from "@/console/overview/overview";
import { cn } from "@/utils/cn";
import { formatCount } from "@/utils/datetime";

// Module 01's plates (Console Overview.dc.html). Server components: nothing here is pressed. The only
// control the sheet draws on them, Urgent actions, is not drawn — see messages/en-IN/overview.ts.
//
// **Every plate has an unknown state, and draws it.** A meter at nothing and a table with no rows
// both read as a quiet day; a store or a log that could not be read is not one.

const m = consoleMessages.overview;

/** The sheet's lamps (industry.css .lamp): lit, half, hollow, ringed. */
const LAMP: Record<Lamp, string> = {
  lit: "bg-accent",
  half: "relative overflow-hidden after:absolute after:inset-y-0 after:left-0 after:w-1/2 after:bg-accent after:content-['']",
  hollow: "bg-transparent",
  ringed: "border-2 border-ink-alert",
};

function LampMark({ lamp, className }: { readonly lamp: Lamp; readonly className?: string }) {
  return <span aria-hidden className={cn("border-line inline-block size-[9px] shrink-0 rounded-full border", LAMP[lamp], className)} />;
}

/** The sheet's plate-level "cannot say": a ringed lamp and one sentence, announced as a status. */
function Unavailable({ children }: { readonly children: string }) {
  return (
    <div role="status" className="flex items-start gap-2.5 px-5 py-4">
      <LampMark lamp="ringed" className="mt-[5px]" />
      <span className="text-sm">{children}</span>
    </div>
  );
}

/** industry.css .meter: a hairline bar, filled to its share. Labelled with the figures, since the fill alone says nothing to a screen reader. */
function Meter({ label, figures, share }: { readonly label: string; readonly figures: string; readonly share: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-sm">{label}</span>
        <span className="legend">{figures}</span>
      </span>
      <div role="img" aria-label={`${label}: ${figures}`} className="border-line-strong relative h-2 border">
        <i className="bg-accent absolute inset-y-0 left-0" style={{ width: `${Math.round(Math.min(1, Math.max(0, share)) * 1000) / 10}%` }} />
      </div>
    </div>
  );
}

export function ServicePlate({ rows }: { readonly rows: readonly { readonly name: string; readonly row: ServiceRow }[] }) {
  return (
    <Plate as="section" title={m.service.title} titleId="ov-service" headingLevel={2} padding="none">
      <ul>
        {rows.map(({ name, row }) => (
          <li key={name} className="border-line flex items-start gap-3 border-t px-5 py-2.5 first:border-t-0">
            <LampMark lamp={row.lamp} className="mt-[5px]" />
            <span className="flex min-w-0 grow flex-col">
              <span className="text-sm">{name}</span>
              {row.notes.map((note) => (
                <span key={note} className="text-ink-1/70 text-xs">
                  {note}
                </span>
              ))}
            </span>
            <span className="shrink-0 text-right text-sm font-medium">{row.word}</span>
          </li>
        ))}
      </ul>
    </Plate>
  );
}

export function ChecksPlate({ budget }: { readonly budget: { readonly configured: boolean; readonly used: number | null; readonly limit: number } }) {
  return (
    <Plate as="section" title={m.checks.title} titleId="ov-checks" headingLevel={2} meta={[m.checks.since]} padding="none">
      {!budget.configured ? (
        <p className="px-5 py-4 text-sm">{m.checks.noBudget}</p>
      ) : budget.used === null ? (
        <Unavailable>{m.checks.unavailable}</Unavailable>
      ) : (
        <div className="px-5 py-4">
          <Meter label={m.checks.budget} figures={m.checks.budgetOf(formatCount(budget.used), formatCount(budget.limit))} share={budget.limit > 0 ? budget.used / budget.limit : 1} />
        </div>
      )}
      {/* Said once, where a reader would otherwise look for the sheet's four figures. */}
      <p className="text-ink-1/70 border-line border-t px-5 py-3 text-xs">{m.checks.notRecorded}</p>
    </Plate>
  );
}

export function QuotaPlate({ configured, quota, resets }: { readonly configured: boolean; readonly quota: MonthQuota | null; readonly resets: string }) {
  return (
    <Plate as="section" title={m.quota.title} titleId="ov-quota" headingLevel={2} padding="none">
      {!configured ? (
        <p className="px-5 py-4 text-sm">{m.quota.notConfigured}</p>
      ) : quota === null ? (
        <Unavailable>{m.quota.unavailable}</Unavailable>
      ) : (
        <div className="flex flex-col gap-3 px-5 py-4">
          <Meter label={m.quota.railkit} figures={m.quota.of(formatCount(quota.used), formatCount(quota.plan), resets)} share={quota.share} />
          {quota.unreadDays > 0 ? <p className="text-ink-1/70 text-xs">{m.quota.unreadDays(quota.unreadDays)}</p> : null}
        </div>
      )}
    </Plate>
  );
}

/** Owner and Admin only — the page decides; this draws what it is given. `null` is a log that could not be read. */
export function RecentPlate({ entries, now }: { readonly entries: readonly AuditEntry[] | null; readonly now: Date }) {
  return (
    <Plate as="section" title={m.recent.title} titleId="ov-recent" headingLevel={2} meta={[m.recent.lastFive]} padding="none">
      {entries === null ? (
        <Unavailable>{m.recent.unreadable}</Unavailable>
      ) : entries.length === 0 ? (
        <p className="px-5 py-4 text-sm">{m.recent.empty}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{m.recent.caption}</caption>
          <thead>
            <tr className="border-line border-b">
              <th scope="col" className="legend px-5 py-2 font-normal">
                {m.recent.time}
              </th>
              <th scope="col" className="legend px-5 py-2 font-normal">
                {m.recent.member}
              </th>
              <th scope="col" className="legend px-5 py-2 font-normal">
                {m.recent.action}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-line border-t first:border-t-0">
                <td className="font-data tnum whitespace-nowrap px-5 py-2.5">{m.recent.at(auditWhen(e.at, now))}</td>
                <td className="px-5 py-2.5">{e.actorName}</td>
                <td className="px-5 py-2.5">{e.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="border-line border-t px-5 py-3">
        {/* Never prefetched: opening the audit log writes an audit row, and a look-ahead is not an open (audit-log/page.tsx). */}
        <Link href={consoleHref("/audit-log")} prefetch={false} className="text-accent-text inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline">
          {m.recent.open}
          <span aria-hidden>&nbsp;→</span>
        </Link>
      </div>
    </Plate>
  );
}
