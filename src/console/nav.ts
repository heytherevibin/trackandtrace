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
 * the same PR that adds its page, and 2d-2 task-8 flips the first one -- 13 Team. The rest are still
 * to come:
 *   - 01 Overview: 2f
 *   - 11 Switches & settings: 2e
 *   - 14 Audit log: 2d-2
 * The other nine modules have no page planned yet.
 */
export const CONSOLE_MODULES: readonly ConsoleModule[] = [
  { num: "01", label: "Overview", group: "operate", roles: EVERY_ROLE, href: consoleHref("/"), built: false },
  { num: "02", label: "Sources & usage", group: "operate", roles: OWNER_ADMIN_VIEWER, href: consoleHref("/sources"), built: false },
  { num: "03", label: "Status & incidents", group: "operate", roles: OWNER_ADMIN_VIEWER, href: consoleHref("/status"), built: false },
  { num: "04", label: "Abuse & limits", group: "operate", roles: OWNER_ADMIN, href: consoleHref("/abuse"), built: false },
  { num: "05", label: "Alerts", group: "operate", roles: OWNER_ADMIN, href: consoleHref("/alerts"), built: false },
  { num: "06", label: "Leads", group: "people", roles: OWNER_ADMIN_SUPPORT, href: consoleHref("/leads"), built: false },
  { num: "07", label: "Announcements", group: "people", roles: OWNER_ADMIN, href: consoleHref("/announcements"), built: false },
  { num: "08", label: "Accounts", group: "people", roles: OWNER_ADMIN, href: consoleHref("/accounts"), built: false },
  { num: "09", label: "Privacy requests", group: "queues", roles: OWNER_ADMIN_SUPPORT, href: consoleHref("/privacy-requests"), built: false },
  { num: "10", label: "Wrong-status reports", group: "queues", roles: OWNER_ADMIN_SUPPORT, href: consoleHref("/wrong-status-reports"), built: false },
  { num: "11", label: "Switches & settings", group: "configure", roles: OWNER_ADMIN, href: consoleHref("/settings"), built: false },
  { num: "12", label: "Provider keys", group: "configure", roles: OWNER_ONLY, href: consoleHref("/provider-keys"), built: false },
  // Sheet's access.Admin (Main.dc.html:295) excludes '13': Owner only, not Owner+Admin as the brief's table said.
  // The first module to be built (2d-2 task-8): src/app/console/team/page.tsx exists, so this is the
  // one `built: true` in the list -- and because it is Owner-only, an Owner is the first and so far
  // only role for which the rail and the phone drawer render at all.
  { num: "13", label: "Team", group: "configure", roles: OWNER_ONLY, href: consoleHref("/team"), built: true },
  { num: "14", label: "Audit log", group: "record", roles: OWNER_ADMIN, href: consoleHref("/audit-log"), built: false },
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
