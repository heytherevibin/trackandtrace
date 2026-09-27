import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAuditLog, type AuditEntry } from "@/console/audit/audit";
import { requireConsoleMember } from "@/console/auth/guard";
import { ROLE_RANK } from "@/console/auth/member";
import { consoleEnvironment } from "@/console/auth/session";
import { ConsoleFrame } from "@/console/components/console-frame";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { accountsRow, checksRow, istDayOfMonth, monthQuota, primarySourceRow, resetsOn, storeRow } from "@/console/overview/overview";
import { ChecksPlate, QuotaPlate, RecentPlate, ServicePlate } from "@/console/overview/overview-plates";
import { pingAccounts, pingStore } from "@/console/overview/pings";
import { RefreshEveryMinute } from "@/console/overview/refresh-every-minute";
import { FUSE_CALLERS, type Fuse } from "@/console/sources/source-plate";
import { PRIMARY_MONTHLY_PLAN } from "@/console/sources/sources";
import { readBreakerState } from "@/services/breaker";
import { accountsConfigured, activePnrSource, env, isThirdPartySource, sharedStoreConfig } from "@/services/env";
import { AppError } from "@/services/errors";
import { liveSpendToday } from "@/services/live-budget";
import { log } from "@/services/log";
import { liveChecksPerDay } from "@/services/runtime-settings";
import { breakerScopeFor, publicStoreForReading } from "@/services/shared-store";
import { readUsageHistory, type UsageDay } from "@/services/usage";
import { formatTime } from "@/utils/datetime";

const m = consoleMessages.overview;

export const metadata: Metadata = { title: m.pageTitle };

const RECENT = 5;

/** The last five rows, across every category and member, for this deployment. Null — not an empty list — when the log could not be read. */
async function readRecent(environment: string): Promise<readonly AuditEntry[] | null> {
  try {
    const page = await getAuditLog({ from: null, to: null, member: null, category: null, result: null, search: null, environment, limit: RECENT, offset: 0 });
    return page.rows;
  } catch (err) {
    log.warn("[console] Overview could not read the audit log", { message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Module 01, Overview (Console Overview.dc.html). Every role may open it — the sheet draws it for all
 * four, with the plates depending on the role — so it is the first page a Support member has.
 *
 * **Everything here is a read of something already recorded**, the same reads modules 02 and 11 make,
 * through the reading store that fails rather than answering from this instance's memory. Four plates
 * of the sheet's eight are drawn; messages/en-IN/overview.ts says why each of the other four is not.
 *
 * Recent actions is Owner and Admin only, as the sheet draws it: "Viewer sees no names". The audit
 * read re-checks the Admin floor in the database itself, so the check here is what keeps the plate
 * off the page rather than what keeps the rows safe.
 *
 * This replaces the redirect to /keys that "/" held until Overview existed. The frame's no-access
 * state has always linked "Back to Overview" here, and now it arrives.
 */
export default async function OverviewPage() {
  const member = await requireConsoleMember().catch((err: unknown) => {
    if (err instanceof AppError && err.code === "UNAUTHENTICATED") return null;
    throw err;
  });
  if (!member) redirect(consoleHref("/login"));

  const current = env();
  const now = new Date();
  const source = activePnrSource(current);
  // A deployment not on a third-party source has no budget to spend, no fuse and no quota.
  const configured = isThirdPartySource(source);
  const store = publicStoreForReading(current);
  const manager = ROLE_RANK[member.role] >= ROLE_RANK.admin;
  const supabase = accountsConfigured(current) ? { url: current.NEXT_PUBLIC_SUPABASE_URL ?? "", key: current.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "" } : null;

  const [storeState, accountsState, used, limit, fuses, history, recent] = await Promise.all([
    pingStore(store, sharedStoreConfig(current) !== null),
    pingAccounts(supabase),
    configured ? liveSpendToday(store.kv, store.prefix) : Promise.resolve(null),
    liveChecksPerDay(current),
    configured
      ? Promise.all(FUSE_CALLERS.map(async (caller): Promise<Fuse> => ({ caller, state: await readBreakerState(store.kv, breakerScopeFor(source, caller, store.prefix)) })))
      : Promise.resolve([] as readonly Fuse[]),
    // Exactly this month's days, so the total is the month's and nothing before the 1st.
    configured ? readUsageHistory(store.kv, store.prefix, source, istDayOfMonth(now), () => now) : Promise.resolve([] as readonly UsageDay[]),
    manager ? readRecent(consoleEnvironment()) : Promise.resolve(null),
  ]);

  const service = [
    { name: m.service.names.checks, row: checksRow({ configured, used, limit }) },
    { name: m.service.names.primary, row: primarySourceRow({ configured, fuses, now }) },
    { name: m.service.names.store, row: storeRow(storeState) },
    { name: m.service.names.accounts, row: accountsRow(accountsState) },
  ];

  return (
    <ConsoleFrame member={member}>
      <RefreshEveryMinute />
      <header className="mt-6">
        <span className="legend-sm text-accent-text">{m.kicker}</span>
        <h1 className="optical-hang tracking-head mt-2 text-4xl">{m.title}</h1>
        <p className="text-ink-1/70 mt-2">{m.lead}</p>
        <p className="text-ink-1/70 mt-1 text-xs">{m.meta(formatTime(now))}</p>
      </header>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <ServicePlate rows={service} />
          <ChecksPlate budget={{ configured, used, limit }} />
        </div>
        <div className="flex flex-col gap-6">
          <QuotaPlate configured={configured} quota={monthQuota(history, PRIMARY_MONTHLY_PLAN)} resets={resetsOn(now)} />
        </div>
      </div>
      {manager ? (
        <div className="mt-6">
          <RecentPlate entries={recent} now={now} />
        </div>
      ) : null}
      <p className="text-ink-1/70 mt-6 text-xs">{m.notDrawn}</p>
    </ConsoleFrame>
  );
}
