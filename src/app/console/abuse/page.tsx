import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LimitsPlate, MostLimitedPlate } from "@/console/abuse/abuse-plates";
import { requireConsoleMember } from "@/console/auth/guard";
import { ROLE_RANK } from "@/console/auth/member";
import { ConsoleFrame } from "@/console/components/console-frame";
import { NoAccessState } from "@/console/components/frame-states";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { pingStore } from "@/console/overview/pings";
import { activePnrSource, env, isThirdPartySource, sharedStoreConfig } from "@/services/env";
import { AppError } from "@/services/errors";
import type { LimitedToday } from "@/services/limited-log";
import { liveSpendToday } from "@/services/live-budget";
import { PNR_RATE_LIMIT } from "@/services/rate-limit";
import { liveChecksPerDay } from "@/services/runtime-settings";
import { limitedLogForReading, publicStoreForReading } from "@/services/shared-store";

const m = consoleMessages.abuse;

export const metadata: Metadata = { title: m.pageTitle };

const MOST_LIMITED = 10;

/**
 * Module 04, Abuse & limits — its read-only half. Owner and Admin, as the sheet's access map gives it.
 *
 * **Everything here is a read.** The limit is the module constant the PNR check uses; the live
 * checks are the budget module 11 draws; the refusals are the limited log `createRateLimiter` now
 * writes. Each read goes to a store that fails rather than answering from this instance's memory, so
 * an unreachable store reads as "the shared store didn't answer", never as a quiet day.
 *
 * Blocking is its own change (the owner's call, 2026-09-28), so there is no "Block an address" here
 * yet: nothing enforces a block until the blocklist lands.
 *
 * The guard carries no role floor, for the reason /audit-log and /team spell out: a role below the
 * floor must still come back with a `member` to render inside ConsoleFrame.
 */
export default async function AbusePage() {
  const member = await requireConsoleMember().catch((err: unknown) => {
    if (err instanceof AppError && err.code === "UNAUTHENTICATED") return null;
    throw err;
  });
  if (!member) redirect(consoleHref("/login"));

  if (ROLE_RANK[member.role] < ROLE_RANK.admin) {
    return (
      <ConsoleFrame member={member}>
        <NoAccessState role={member.role} />
      </ConsoleFrame>
    );
  }

  const current = env();
  const now = new Date().getTime();
  const configured = isThirdPartySource(activePnrSource(current));
  const store = publicStoreForReading(current);
  const [storeState, used, limit, today] = await Promise.all([
    pingStore(store, sharedStoreConfig(current) !== null),
    configured ? liveSpendToday(store.kv, store.prefix) : Promise.resolve(null),
    liveChecksPerDay(current),
    limitedLogForReading(current)
      .today(MOST_LIMITED, now)
      .catch((): LimitedToday | null => null),
  ]);

  return (
    <ConsoleFrame member={member}>
      <header className="mt-6">
        <span className="legend-sm text-accent-text">{m.kicker}</span>
        <h1 className="optical-hang tracking-head mt-2 text-4xl">{m.title}</h1>
        <p className="text-ink-1/70 mt-2">{m.lead}</p>
      </header>
      <div className="mt-6 flex flex-col gap-6">
        <LimitsPlate perMinute={PNR_RATE_LIMIT.limit} live={configured ? { used, limit } : null} limitedToday={today?.total ?? null} store={storeState} />
        <MostLimitedPlate today={today} />
      </div>
      <p className="text-ink-1/70 mt-6 text-xs">{m.notDrawn}</p>
    </ConsoleFrame>
  );
}
