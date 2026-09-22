import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { consoleSql, expect } from "./fixtures";
import { inviteMember, joinFromInviteOn } from "./team-helpers";
import { consoleMessages } from "@/console/messages";
import { gotoReady } from "../helpers";

/**
 * What the Audit log's two specs -- audit-log.spec.ts and the 390px scan -- ask the database and
 * the page over and over, plus the screenshot hook both use. Not a spec file itself --
 * Playwright's default testMatch only collects `*.spec.ts`/`*.test.ts`, so this is imported, never
 * run (team-helpers.ts's own note) -- and not part of `fixtures.ts`, which is the console-wide kit
 * every spec in this directory uses.
 *
 * It exists because `console.audit_log` survives `resetConsole()` by design: the log holds no
 * foreign keys and outliving its subjects is the whole point of it. Every count taken against it is
 * therefore a count over every run this machine has ever done, unless it is scoped to the rows the
 * test in front of you wrote -- a trap this branch fell into four separate times. One scoped
 * counter, in one place, is one place for that to be got right.
 */

const m = consoleMessages.audit;

/** The two actions this module writes about itself. */
export const OPENED = "Opened the audit log";
export const EXPORTED = "Exported the audit log";

/**
 * Rows a named actor wrote, optionally narrowed to one action -- never the table.
 *
 * `actor_name` is the log's own denormalised copy of the member's name, and `setUpFirstOwner` mints
 * a fresh address per run, so it names exactly the rows one test is responsible for.
 */
export function auditRows(actorName: string, action?: string): number {
  const quoted = (value: string) => value.replaceAll("'", "''");
  const narrowed = action ? ` and action = '${quoted(action)}'` : "";
  return Number(consoleSql(`select count(*) from console.audit_log where actor_name = '${quoted(actorName)}'${narrowed}`));
}

/**
 * The same count, once it has stopped moving.
 *
 * The page writes its own row from `after()`, *after* the response has already gone out, so a count
 * taken the moment a row appears can still grow by one while the next assertion runs -- which is
 * exactly how the first version of these assertions failed, as before+1. Polling for a single value
 * would only move the race; polling for two consecutive reads that agree is what actually waits for
 * the write to land.
 */
export async function settledAuditRows(actorName: string, action?: string): Promise<number> {
  let previous = -1;
  await expect
    .poll(() => {
      const now = auditRows(actorName, action);
      const settled = now > 0 && now === previous;
      previous = now;
      return settled;
    })
    .toBe(true);
  return previous;
}

/**
 * The Entries plate's own header cell -- "Today · 14" (AuditLog.dc.html:353) -- which is the count
 * as a member reads it rather than as SQL does. It is drawn whatever the filters return, including
 * nothing, so it is the one place on the page that can be asked "how many, now?" in every state.
 */
export async function expectEntriesTotal(page: Page, range: keyof typeof m.filters.ranges, total: number): Promise<void> {
  await expect(page.getByText(m.entries.rangeCell(m.filters.ranges[range], total), { exact: true })).toBeVisible();
}

/**
 * Rows for somebody who is not a console member at all, written straight into the log -- the only
 * way to give the Member filter another actor's rows to narrow to without paying for a second
 * invite and two key enrolments, and the shape Task 6's own roster test already uses.
 *
 * `environment` is this deployment's own ('development' under `next dev`), because the page's
 * Environment filter defaults to it and rows written under any other name would be filtered out of
 * the view before the test could count them.
 *
 * A fresh actor id per call, handed back: `console.audit_log` survives every reset, so a fixed id
 * would mean these rows counted twice on the second run on this machine and three times on the
 * third.
 */
export function writeForeignRows(name: string, category: string, actions: readonly string[]): string {
  const actor = randomUUID();
  const rows = actions
    .map((action) => `('development', '${actor}', '${name}', 'owner', '${category}', '${action.replaceAll("'", "''")}', 'Kiran Das', 'done')`)
    .join(",");
  consoleSql(`insert into console.audit_log (environment, actor_id, actor_name, actor_role, category, action, target, result) values ${rows}`);
  return actor;
}

/**
 * A member invited from this Owner's Team page and signed in on a device of their own, handed back
 * **still open** -- unlike `joinFromInvite`, which closes the context it made the moment the
 * journey is proven. The Audit log is the first module a role other than Owner can open at all, so
 * this is the first spec that has to keep driving the page afterwards.
 *
 * Its own context, which is what "a device of their own" means: a second page in the Owner's
 * context would share the Owner's console cookie and sign one of the two out.
 *
 * The caller closes it -- `await them.context().close()` -- in a `finally`, so a failed assertion
 * does not leak a browser context into the rest of the run.
 */
export async function inviteAndSignIn(owner: Page, email: string, role: string, reason: string): Promise<Page> {
  await gotoReady(owner, "/team");
  await inviteMember(owner, email, role, reason);
  const browser = owner.context().browser();
  if (!browser) throw new Error("no browser instance available for a fresh context");
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const them = await context.newPage();
  await joinFromInviteOn(them, email, role);
  return them;
}

/**
 * A screenshot, when `CONSOLE_SHOTS` names a directory to put one in, and nothing at all otherwise
 * -- so a normal run, and CI, pay nothing for this.
 *
 * The viewport rather than the full page: three of the four things worth looking at here are
 * modals or fixed-position rows, and `fullPage` stitches a scrolled capture in which a fixed
 * element lands wherever the first tile put it. What a member sees is the viewport.
 */
export async function shot(page: Page, name: string): Promise<void> {
  const directory = process.env.CONSOLE_SHOTS;
  if (!directory) return;
  await page.screenshot({ path: `${directory}/${name}.png` });
}
