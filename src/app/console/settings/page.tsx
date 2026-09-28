import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createConsoleServiceDb } from "@/console/auth/db";
import { requireConsoleMember } from "@/console/auth/guard";
import { ROLE_RANK } from "@/console/auth/member";
import { consoleEnvironment } from "@/console/auth/session";
import { ConsoleFrame } from "@/console/components/console-frame";
import { NoAccessState } from "@/console/components/frame-states";
import { consoleHref } from "@/console/href";
import { consoleMessages } from "@/console/messages";
import { lastSettingChange } from "@/console/settings/last-change";
import { LimitsPlate } from "@/console/settings/limits-plate";
import { readNotice } from "@/console/settings/notice";
import { NoticePlate } from "@/console/settings/notice-plate";
import { readLimits, type SettingsRow } from "@/console/settings/settings";
import { liveRequestsPerDay } from "@/services/env";
import { AppError } from "@/services/errors";
import { log } from "@/services/log";
import { liveSpendToday } from "@/services/live-budget";
import { publicStoreForReading } from "@/services/shared-store";

const m = consoleMessages.settings;

export const metadata: Metadata = { title: m.pageTitle };

/**
 * Module 11, Switches & settings (Console Switches.dc.html). Owner and Admin, as the sheet's own
 * access map gives it.
 *
 * The guard carries no role floor, for the reason /audit-log and /team both spell out: a role below
 * the floor must still come back with a `member` to render inside ConsoleFrame, because
 * NoAccessState takes a role and a frame to sit in. `console_save_settings` re-checks the Admin
 * floor itself, so this page's check is honesty rather than the security boundary.
 *
 * **Two plates of the three the sheet draws, and two of its eight switches.** `live_checks_per_day`
 * (Limits) and the site notice (Switches) are the ones something reads — the notice since the
 * traveller strip was built (src/components/shell/site-notice-slot.tsx). The rate limits are module
 * constants and the source registry reads the environment. A control that writes an audit row and
 * changes nothing tells an operator the site is doing something it is not, which is the failure that
 * left live_checks_per_day unread from PR #23 until it was wired. Each remaining row arrives with its
 * wiring.
 */
async function readSettingsRow(environment: string): Promise<SettingsRow | null> {
  try {
    const { data, error } = await createConsoleServiceDb().rpc("console_auth_read_settings", { p_environment: environment });
    if (error) throw new Error(error.message);
    return (data ?? null) as SettingsRow | null;
  } catch (err) {
    log.warn("[console] the settings row could not be read", { message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export default async function SettingsPage() {
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

  const environment = consoleEnvironment();
  const [row, used, liveChange, noticeChange] = await Promise.all([
    // Null, not a throw: the plate then draws the deployment's own number and says where it came
    // from, which is true and useful — an error boundary would take the whole module down over one
    // read. PostgrestFilterBuilder is a thenable rather than a Promise, so the catch goes on the
    // async wrapper rather than on the builder.
    readSettingsRow(environment),
    // Null, not zero. "0 used today" is a claim about a quiet day; an unread counter is an absence,
    // and drawing the first for the second tells an operator the site is idle when it may be busy.
    // The reading store, not `publicStore`: that one answers from this instance's memory when
    // Upstash is down, which would draw "0 used" rather than the null this comment is about.
    liveSpendToday(publicStoreForReading().kv, publicStoreForReading().prefix),
    // "Every row shows who changed it last, and when" — from that setting's own audit rows. The
    // settings row cannot say it: its changed_at is when ANY switch moved, and it holds no name.
    lastSettingChange("live_checks_per_day", environment),
    lastSettingChange("site_notice", environment),
  ]);

  const limits = { ...readLimits(row, { used, fallback: liveRequestsPerDay() }), changedAt: liveChange?.at ?? null, changedBy: liveChange?.by ?? null };

  return (
    <ConsoleFrame member={member}>
      <header className="mt-6">
        <span className="legend-sm text-accent-text">{m.kicker}</span>
        <h1 className="optical-hang tracking-head mt-2 text-4xl">{m.title}</h1>
        <p className="text-ink-1/70 mt-2">{m.lead}</p>
      </header>
      <NoticePlate notice={readNotice(row)} rowVersion={row?.version ?? null} environment={environment} lastChanged={noticeChange} />
      <LimitsPlate limits={limits} environment={environment} />
    </ConsoleFrame>
  );
}
