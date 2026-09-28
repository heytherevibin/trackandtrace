import type { Metadata } from "next";
import { requireConsoleMember } from "@/console/auth/guard";
import { ROLE_RANK } from "@/console/auth/member";
import { ConsoleFrame } from "@/console/components/console-frame";
import { NoAccessState } from "@/console/components/frame-states";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { FUSE_CALLERS, SourcePlate, type Fuse } from "@/console/sources/source-plate";
import { readSourceUsage } from "@/console/sources/sources";
import { readBreakerState } from "@/services/breaker";
import { activePnrSource, isThirdPartySource } from "@/services/env";
import { AppError } from "@/services/errors";
import { breakerScopeFor, publicStoreForReading } from "@/services/shared-store";
import { readUsageHistory, type UsageDay } from "@/services/usage";
import { redirect } from "next/navigation";

const m = consoleMessages.sources;

export const metadata: Metadata = { title: m.pageTitle };

const HISTORY_DAYS = 30;

/**
 * Module 02, Sources & usage (Console Sources.dc.html). Owner, Admin and Viewer — the sheet says
 * "Viewer can read it", and there is nothing to press: "There are no actions on this sheet".
 *
 * That makes Viewer the first role with a page of its own. Until now every built module was
 * Owner-only or Owner+Admin, so a Viewer signed in to an empty rail.
 *
 * **Everything here is a READ of something already being written.** The daily counter, the breaker's
 * own keys — this module records nothing new and asks the provider nothing. `readBreakerState` in
 * particular reads the fuse rather than calling `admit()`, which is the gate's own question and, on
 * a probing fuse, the very call that spends the probe.
 *
 * The guard carries no role floor, for the reason /audit-log and /team both spell out: a role below
 * the floor must still come back with a `member` to render inside ConsoleFrame.
 */
export default async function SourcesPage() {
  const member = await requireConsoleMember().catch((err: unknown) => {
    if (err instanceof AppError && err.code === "UNAUTHENTICATED") return null;
    throw err;
  });
  if (!member) redirect(consoleHref("/login"));

  if (ROLE_RANK[member.role] < ROLE_RANK.viewer) {
    return (
      <ConsoleFrame member={member}>
        <NoAccessState role={member.role} />
      </ConsoleFrame>
    );
  }

  const source = activePnrSource();
  // A deployment not on a third-party source has no quota to spend and no fuse to draw. The sheet's
  // own "a source not configured" state covers it, and it is the honest thing to show rather than a
  // plate of zeroes about a provider nobody is asking.
  const configured = isThirdPartySource(source);
  // The reading store: `publicStore` falls back to this instance's memory when Upstash is down, and
  // every "cannot say" below would then read as "Answering" and "0 requests".
  const { kv, prefix } = publicStoreForReading();

  const [history, fuses] = configured
    ? await Promise.all([
        readUsageHistory(kv, prefix, source, HISTORY_DAYS),
        Promise.all(
          FUSE_CALLERS.map(async (caller): Promise<Fuse> => ({ caller, state: await readBreakerState(kv, breakerScopeFor(source, caller, prefix)) })),
        ),
      ])
    : [[] as readonly UsageDay[], [] as readonly Fuse[]];

  const usage = readSourceUsage(history);
  const now = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });

  return (
    <ConsoleFrame member={member}>
      <header className="mt-6">
        <span className="legend-sm text-accent-text">{m.kicker}</span>
        <h1 className="optical-hang tracking-head mt-2 text-4xl">{m.title}</h1>
        <p className="text-ink-1/70 mt-2">{m.lead}</p>
        <p className="text-ink-1/70 mt-1 text-xs">{m.updated(now)}</p>
      </header>
      {configured ? <SourcePlate usage={usage} history={history} fuses={fuses} /> : <p className="text-ink-1/70 mt-6">{m.notConfigured}</p>}
    </ConsoleFrame>
  );
}
