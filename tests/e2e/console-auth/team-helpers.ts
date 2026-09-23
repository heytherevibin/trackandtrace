import type { Browser, Page } from "@playwright/test";
import { addVirtualKey, chooseKeyKind, consoleSql, expect, expectSignedInAs, ownerIdentity, readOutbox, swapAuthenticatorAfterTap } from "./fixtures";

/**
 * The pieces both Team end-to-end specs drive the page with. Not a spec file itself -- Playwright's
 * default testMatch only collects `*.spec.ts`/`*.test.ts`, so this is imported, never run -- and
 * not part of `fixtures.ts`, which is the console-wide kit every spec in this directory uses.
 *
 * It exists because team-rejoin.spec.ts walks the same journey team.spec.ts does and then walks the
 * member's half of it a second time. Three copies of the invite-accept-enrol ceremony is three
 * places for it to drift.
 */

export const INVITE_SUBJECT = "You're invited to the Trakline console";
export const SIGN_IN_SUBJECT = "Your Trakline console sign-in link";

/**
 * An address nothing has seen. Unique across runs on purpose: `resetConsole()` does not touch
 * auth.users, and `console_invite_member` refuses any address that already has one
 * (20260922110000_console_invite_blocks_traveller.sql), so a fixed address would pass once and
 * refuse for the rest of this machine's life.
 */
export function freshAddress(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@trakline.in`;
}

/**
 * The one letter waiting for `email`. `readOutbox`'s own `to` filter removes what it returns, so
 * the poll keeps its own read rather than reading a second time (sign-in.spec.ts's own note).
 * Polled because both sends run in `after()`, off the response path.
 */
export async function letterFor(page: Page, email: string, subject: string): Promise<{ to: string; subject: string; text: string }> {
  let found: Awaited<ReturnType<typeof readOutbox>> = [];
  await expect
    .poll(
      async () => {
        found = await readOutbox(page, email);
        return found.length;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);
  const letter = found[0];
  if (!letter) throw new Error(`no letter for ${email}`);
  expect(letter.subject).toBe(subject);
  return letter;
}

export function linkIn(text: string, path: "setup" | "auth/confirm"): string {
  const link = new RegExp(`https?://\\S+/${path}\\S+`).exec(text)?.[0];
  expect(link, `no /${path} link in: ${text}`).toBeTruthy();
  return String(link);
}

export const membersTable = (page: Page) => page.getByRole("region", { name: "Console members", exact: true });
export const invitesTable = (page: Page) => page.getByRole("region", { name: "Invites waiting to be accepted", exact: true });

/** TC-01: type the reason, tap, and wait for the dialog the completed tap closes. */
export async function tapThrough(page: Page, reason: string): Promise<void> {
  const tc01 = page.getByRole("dialog", { name: "Confirm it's you" });
  await expect(tc01).toBeVisible();
  await tc01.getByLabel("Reason").fill(reason);
  await tc01.getByRole("button", { name: "Tap your key" }).click();
  await expect(tc01).not.toBeVisible();
}

/** TC-04 then TC-01: one invite, through the drawn dialog and a real tap. */
export async function inviteMember(page: Page, email: string, role: string, reason: string): Promise<void> {
  // Two triggers carry these words while the console has one member -- the page header's primary
  // (:106) and the secondary beside the only-you note (:157). Either opens the one dialog.
  await page.getByRole("button", { name: "Invite a member" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Invite a member" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("radio", { name: role }).click();
  await dialog.getByRole("button", { name: "Continue" }).click();
  await tapThrough(page, reason);
}

export async function rowMenu(page: Page, name: string, item: "Change role" | "Reset keys" | "Remove"): Promise<void> {
  await membersTable(page).getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

export const idOf = (email: string) => consoleSql(`select user_id from console.members where email = '${email}'`);
export const roleOf = (email: string) => consoleSql(`select role from console.members where email = '${email}'`);
export const keyCountOf = (memberId: string) => consoleSql(`select count(*) from console.keys where member_id = '${memberId}'`);

/** Scoped to one actor, one action and one target: the audit log outlives every reset. */
export function auditCount(actor: string, action: string, target: string): string {
  const quoted = action.replaceAll("'", "''");
  return consoleSql(`select count(*) from console.audit_log where actor_id = '${actor}' and action = '${quoted}' and target = '${target}'`);
}

/**
 * The invited member's own half, start to finish, on a device of their own: read the letter, accept
 * it, open the sign-in link that follows, enrol two keys and land in the console with the role the
 * invite named. A fresh browser context each time, which is what "a device of their own" means --
 * and, for a member joining a second time, what stops the second journey leaning on a cookie or an
 * authenticator the first one left lying around.
 *
 * The "Add your first key" assertion is the load-bearing one for a re-invited member, and it is
 * here rather than in the caller because it is the same fact in both journeys. `nextAfterConfirm`
 * (src/console/auth/session.ts:59) routes on the key count alone: a member arriving with keys still
 * on their row is sent to /sign-in-key instead, never sees this heading, and can never reach the
 * one call that moves them out of `setup`.
 */
export async function joinFromInvite(browser: Browser, email: string, role: string): Promise<void> {
  const context = await browser.newContext();
  const them = await context.newPage();
  try {
    await joinFromInviteOn(them, email, role);
  } finally {
    await context.close();
  }
}

/**
 * The same journey, on a page the caller made and keeps. A pure extraction from `joinFromInvite`
 * above, which is now this plus the context it opens and closes around it: the Audit log is the
 * first module a role other than Owner can open at all, so it is the first spec that has to keep
 * driving the page once the join is proven rather than throwing the device away.
 */
export async function joinFromInviteOn(them: Page, email: string, role: string): Promise<void> {
  const invite = await letterFor(them, email, INVITE_SUBJECT);
  expect(invite.text, "the letter names the role they were invited as").toContain(`as ${role}`);
  await them.goto(linkIn(invite.text, "setup"));
  await them.getByRole("button", { name: "Accept and email me a sign-in link" }).click();
  await expect(them.getByText("Check your inbox. Open the link on the device you'll set up.")).toBeVisible();

  const signIn = await letterFor(them, email, SIGN_IN_SUBJECT);
  await them.goto(linkIn(signIn.text, "auth/confirm"));
  const firstKey = await addVirtualKey(them, "usb");
  await expect(them.getByRole("heading", { name: "Add your first key" }), `${email} was sent to enrol, not to tap a key they should no longer hold`).toBeVisible();
  await chooseKeyKind(them, "usb");
  await them.getByLabel("Name this key").fill("YubiKey 5C");
  await them.getByRole("button", { name: "Add key" }).click();
  await expect(them.getByRole("heading", { name: "Add a second key" })).toBeVisible();
  await swapAuthenticatorAfterTap(them, firstKey, "internal");
  await chooseKeyKind(them, "internal");
  await them.getByLabel("Name this key").fill("iPhone");
  await them.getByRole("button", { name: "Add key" }).click();
  await them.getByRole("button", { name: "Open the console" }).click();
  await expectSignedInAs(them, ownerIdentity(email).name, role);
}
