import type { Route } from "next";
import type { ConsoleRole } from "@/console/auth/member";
import { consoleHref } from "@/console/href";

/** The five legends `allGroups` draws, in the order the rail draws them. Copy lives in messages (frameSignedIn.nav.groupLabel); this is a stable key, not the word itself. */
export type ConsoleGroupKey = "operate" | "people" | "queues" | "configure" | "record";

export interface ConsoleModule {
  /** "01".."14", exactly as Main.dc.html's {{it.num}} draws it. */
  readonly num: string;
  readonly label: string;
  readonly group: ConsoleGroupKey;
  /** Who may open it. Checked against Main.dc.html:293-298's own `access` map, not any other transcription of it. */
  readonly roles: readonly ConsoleRole[];
  readonly href: Route;
  /** Flips to true in the same PR that adds the module's page (see the comments below). */
  readonly built: boolean;
}

export interface ConsoleNavGroup {
  readonly group: ConsoleGroupKey;
  readonly modules: readonly ConsoleModule[];
}

const OWNER_ONLY = ["owner"] as const;
const OWNER_ADMIN = ["owner", "admin"] as const;
const OWNER_ADMIN_SUPPORT = ["owner", "admin", "support"] as const;
const OWNER_ADMIN_VIEWER = ["owner", "admin", "viewer"] as const;
const EVERY_ROLE = ["owner", "admin", "support", "viewer"] as const;

/**
 * The fourteen modules Main.dc.html's rail draws (spec: task-4-brief.md, corrected by
 * task-4-addendum.md §5). Every `roles` list here is checked against the sheet's own `access` map
 * in `renderVals()` (Main.dc.html:293-298), not against the brief's table -- which mistranscribed
 * row 13: it gives Admin "Team", the sheet's access.Admin list does not (nav.test.ts pins this).
 *
 * `built` was false for all fourteen in 2d-1: no module had a page, and a rail of links that all
 * lead nowhere is worse than no rail (task-4-brief.md's ruling). A module's flag flips to true in
 * the same PR that adds its page; 2d-2 task-8 flipped the first one -- 13 Team -- and 2d-2b task-2
 * flips the second, 14 Audit log. 11 Switches, 02 Sources, 01 Overview and 04 Abuse followed; the rest have
 * no page yet.
 */
export const CONSOLE_MODULES: readonly ConsoleModule[] = [
  // 2026-09-28: src/app/console/page.tsx is Overview now rather than a redirect to My keys, so this
  // flips. Every role may open it, so it is the first page Support has — its own three modules are
  // still unbuilt.
  { num: "01", label: "Overview", group: "operate", roles: EVERY_ROLE, href: consoleHref("/"), built: true },
  // 2026-09-28: src/app/console/sources/page.tsx exists, so this flips — and it is the first module
  // a VIEWER can open, so it is the first time that role gets a rail at all. Everything on it is a
  // read of something already recorded; the sheet's own note says there are no actions on it.
  { num: "02", label: "Sources & usage", group: "operate", roles: OWNER_ADMIN_VIEWER, href: consoleHref("/sources"), built: true },
  { num: "03", label: "Status & incidents", group: "operate", roles: OWNER_ADMIN_VIEWER, href: consoleHref("/status"), built: false },
  // 2026-09-28: src/app/console/abuse/page.tsx exists — its read-only half. Blocking follows in its
  // own change, so the page draws Limits and Most limited today and no Block control yet.
  { num: "04", label: "Abuse & limits", group: "operate", roles: OWNER_ADMIN, href: consoleHref("/abuse"), built: true },
  { num: "05", label: "Alerts", group: "operate", roles: OWNER_ADMIN, href: consoleHref("/alerts"), built: false },
  // Built 2026-10-04: the list, search by full email, reveal, and the record (sheet 22). Export,
  // tags, notes and deletion follow in their own changes; the address and the access do not change.
  { num: "06", label: "Leads", group: "people", roles: OWNER_ADMIN_SUPPORT, href: consoleHref("/leads"), built: true },
  // Built 2026-10-04: the Letters pages (list, compose, test send, queue, detail, stop). Its
  // Suppressions tab follows; the module's address and its access do not change when it does.
  { num: "07", label: "Announcements", group: "people", roles: OWNER_ADMIN, href: consoleHref("/announcements"), built: true },
  { num: "08", label: "Accounts", group: "people", roles: OWNER_ADMIN, href: consoleHref("/accounts"), built: true },
  { num: "09", label: "Privacy requests", group: "queues", roles: OWNER_ADMIN_SUPPORT, href: consoleHref("/privacy-requests"), built: false },
  { num: "10", label: "Wrong-status reports", group: "queues", roles: OWNER_ADMIN_SUPPORT, href: consoleHref("/wrong-status-reports"), built: false },
  // 2026-09-27: src/app/console/settings/page.tsx exists, so this flips. It draws one plate of the
  // three the sheet has, and one row of that plate's two — `live_checks_per_day` is the only switch
  // in console.settings that anything reads, so it is the only one with a control. The rail links
  // to what is there.
  { num: "11", label: "Switches & settings", group: "configure", roles: OWNER_ADMIN, href: consoleHref("/settings"), built: true },
  { num: "12", label: "Provider keys", group: "configure", roles: OWNER_ONLY, href: consoleHref("/provider-keys"), built: false },
  // Sheet's access.Admin (Main.dc.html:295) excludes '13': Owner only, not Owner+Admin as the brief's table said.
  // The first module to be built (2d-2 task-8): src/app/console/team/page.tsx exists, so this is the
  // one `built: true` in the list -- and because it is Owner-only, an Owner is the first and so far
  // only role for which the rail and the phone drawer render at all.
  { num: "13", label: "Team", group: "configure", roles: OWNER_ONLY, href: consoleHref("/team"), built: true },
  // 2d-2b task-2: src/app/console/audit-log/page.tsx exists, so this flips too -- and because it is
  // Owner+Admin, an Admin now gets a rail for the first time (Team, the only other built module, is
  // Owner-only). Flipping it is what the flag is for; the task brief's file list omits this file,
  // which task-2-report.md records.
  { num: "14", label: "Audit log", group: "record", roles: OWNER_ADMIN, href: consoleHref("/audit-log"), built: true },
];

/**
 * The groups a role sees: only modules that role may open (`roles`) and that already have a page
 * (`built`), grouped in the sheet's own order, with any group left empty dropped entirely.
 *
 * `modules` defaults to the real `CONSOLE_MODULES`; tests pass a fixture instead (task-4-addendum.md
 * §1), because the real list has exactly one built module -- 13 Team, and Owner-only -- which cannot
 * show a Viewer being filtered differently from an Admin. Both are asserted: the fixture for the
 * filtering, the real list for what a role actually sees today (tests/unit/console/nav.test.ts).
 */
export function railFor(role: ConsoleRole, modules: readonly ConsoleModule[] = CONSOLE_MODULES): readonly ConsoleNavGroup[] {
  // Not `module`: reserved by webpack's module wrapper (@next/next/no-assign-module-variable).
  const visible = modules.filter((mod) => mod.built && mod.roles.includes(role));
  const order: ConsoleGroupKey[] = [];
  for (const mod of visible) if (!order.includes(mod.group)) order.push(mod.group);
  return order.map((group) => ({ group, modules: visible.filter((mod) => mod.group === group) }));
}
