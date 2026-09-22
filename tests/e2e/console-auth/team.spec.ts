import type { Page } from "@playwright/test";
import { addVirtualKey, consoleSql, expect, expectSignedInAs, ownerIdentity, readOutbox, resetConsole, setUpFirstOwner, swapAuthenticatorAfterTap, test } from "./fixtures";
import { gotoReady } from "../helpers";

/**
 * Team, end to end (task-9). Six tasks asserted the tap's two halves against mocks; this is the
 * first place a real browser mint and `console.use_tap`'s real re-digest meet. Five actions mint
 * over five different `target`/`value` pairs, and each is its own way for the halves to disagree:
 *
 * | Action                 | target                  | value                   |
 * |------------------------|-------------------------|-------------------------|
 * | Invited a member       | the lower-cased address | the role                |
 * | Changed a role         | the member's id         | the new role            |
 * | Reset a member's keys  | the member's id         | the key count, as text  |
 * | Removed a member       | the member's id         | their *current* role    |
 * | Revoked an invite      | the invite's id         | the invite's email      |
 *
 * A mismatch surfaces as "no tap for this action" (42501) and nothing on screen says why, so each
 * of the five is driven through a real WebAuthn assertion below rather than one standing for all.
 *
 * `resetConsole()` empties console.members and console.setup_links but never console.audit_log
 * (it holds no foreign keys), so every audit assertion is scoped to this run's own actor.
 */

const BASE = "http://admin.localhost:4211";

test.beforeEach(() => resetConsole());

/**
 * The console is also left as this file found it, which `beforeEach` alone does not do: it fixes
 * the state each test *starts* in, so the last test's rows outlive the run. That matters because
 * `npm run db:test`'s pgTAP suite is not isolated from them -- console_team.test.sql counts Owners,
 * invites and roster rows across the whole console, not only its own fixtures, so one leftover Owner
 * and one leftover invite fail seven of its assertions (task-9-report.md has the list). Before this
 * file the property held by luck: sign-in.spec.ts ran last and its own last test creates no member.
 */
test.afterAll(() => resetConsole());

/**
 * An address nothing has seen. Unique across runs on purpose: `resetConsole()` does not touch
 * auth.users, and `console_invite_member` refuses any address that already has one
 * (20260922110000_console_invite_blocks_traveller.sql), so a fixed address would pass once and
 * refuse for the rest of this machine's life.
 */
function freshAddress(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@trakline.in`;
}

/**
 * The one letter waiting for `email`. `readOutbox`'s own `to` filter removes what it returns, so
 * the poll keeps its own read rather than reading a second time (sign-in.spec.ts's own note).
 * Polled because both sends run in `after()`, off the response path.
 */
async function letterFor(page: Page, email: string, subject: string): Promise<{ to: string; subject: string; text: string }> {
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

function linkIn(text: string, path: "setup" | "auth/confirm"): string {
  const link = new RegExp(`https?://\\S+/${path}\\S+`).exec(text)?.[0];
  expect(link, `no /${path} link in: ${text}`).toBeTruthy();
  return String(link);
}

const membersTable = (page: Page) => page.getByRole("region", { name: "Console members", exact: true });
const invitesTable = (page: Page) => page.getByRole("region", { name: "Invites waiting to be accepted", exact: true });

/** TC-01: type the reason, tap, and wait for the dialog the completed tap closes. */
async function tapThrough(page: Page, reason: string): Promise<void> {
  const tc01 = page.getByRole("dialog", { name: "Confirm it's you" });
  await expect(tc01).toBeVisible();
  await tc01.getByLabel("Reason").fill(reason);
  await tc01.getByRole("button", { name: "Tap your key" }).click();
  await expect(tc01).not.toBeVisible();
}

/** TC-04 then TC-01: one invite, through the drawn dialog and a real tap. */
async function inviteMember(page: Page, email: string, role: string, reason: string): Promise<void> {
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

async function rowMenu(page: Page, name: string, item: "Change role" | "Reset keys" | "Remove"): Promise<void> {
  await membersTable(page).getByRole("button", { name: `Actions for ${name}` }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

const idOf = (email: string) => consoleSql(`select user_id from console.members where email = '${email}'`);
const roleOf = (email: string) => consoleSql(`select role from console.members where email = '${email}'`);

/** Scoped to one actor, one action and one target: the audit log outlives every reset. */
function auditCount(actor: string, action: string, target: string): string {
  const quoted = action.replaceAll("'", "''");
  return consoleSql(`select count(*) from console.audit_log where actor_id = '${actor}' and action = '${quoted}' and target = '${target}'`);
}

test.describe("Team", () => {
  /**
   * The console as an Owner alone finds it, and the three answers their own row gives. All three
   * are decided in the browser from the roster the page already holds (task-5-addendum.md §3), so
   * the last assertion goes past the browser entirely and asks the database the same question.
   */
  test("an Owner reaches Team from the rail, and their own row answers with notices, never a tap", async ({ page, baseURL }) => {
    const base = baseURL ?? BASE;
    const owner = await setUpFirstOwner(page, base);
    await expectSignedInAs(page, owner.name, owner.role);

    // 2015511 made the rail live for the first time: 13 Team is the one module with `built: true`,
    // and it is Owner-only, so this is the first role for which a rail is drawn at all.
    const rail = page.getByRole("navigation", { name: "Console" });
    await expect(rail.getByText("Configure")).toBeVisible();
    await rail.getByRole("link", { name: "Team", exact: true }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Team" })).toBeVisible();
    await expect(page.getByText("13 · Team")).toBeVisible();
    await expect(page.getByText("Who can use the console, and with which role.")).toBeVisible();
    await expect(page.getByText("1 member", { exact: true })).toBeVisible();
    await expect(page.getByText("You're the only member.")).toBeVisible();

    const ownRow = membersTable(page).getByRole("row").filter({ hasText: owner.email });
    await expect(ownRow).toContainText(owner.name);
    await expect(ownRow).toContainText("Owner");
    await expect(ownRow).toContainText("2 keys");
    await expect(ownRow).toContainText("Active");
    // The Roles plate, transcribed by Task 3: module 13 is the Owner's alone.
    await expect(page.getByText("14 modules")).toBeVisible();
    await expect(page.getByText("Only Owners manage the team and provider keys.")).toBeVisible();

    // Change role on your own row: dlg_owner instead of a picker, because every role the picker
    // could offer is refused (the self-check is unconditional, whatever the new role).
    await rowMenu(page, owner.name, "Change role");
    const lastOwner = page.getByRole("alertdialog", { name: "A console needs at least one Owner" });
    await expect(lastOwner).toBeVisible();
    await expect(lastOwner).toContainText("Make someone else Owner first.");
    await expect(page.getByRole("dialog", { name: "Confirm it's you" })).toHaveCount(0);
    await lastOwner.getByRole("button", { name: "OK" }).click();

    // Reset keys on your own row: its own notice, not dlg_owner's -- the rule is not about Owners.
    // 37aba03's late fix, and worth an end-to-end assertion precisely because the notice is
    // authored copy the sheet never drew (task-9-addendum.md §4).
    await rowMenu(page, owner.name, "Reset keys");
    const ownKeys = page.getByRole("alertdialog", { name: "Resetting your own keys would lock you out" });
    await expect(ownKeys).toBeVisible();
    await expect(ownKeys).toContainText("Add a new key under My keys and remove the old one instead.");
    await expect(page.getByRole("dialog", { name: "Confirm it's you" })).toHaveCount(0);
    await ownKeys.getByRole("button", { name: "OK" }).click();

    // Remove on your own row: dlg_owner again -- console_remove_member carries console_change_role's
    // refusals word for word (task-6-addendum.md §4), so one set of words serves both.
    await rowMenu(page, owner.name, "Remove");
    await expect(page.getByRole("alertdialog", { name: "A console needs at least one Owner" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Confirm it's you" })).toHaveCount(0);
    await page.getByRole("alertdialog").getByRole("button", { name: "OK" }).click();

    // And the floor is the database's, not the browser's. This mints a real challenge and calls
    // PATCH with no ceremony at all -- the path a second tab or a hostile caller takes. The
    // refusal that comes back tells which guard answered: `console_change_role` raises its
    // self-check (42501) *before* console.use_tap, so a missing tap would read "That confirmation
    // no longer matches this change." and the floor reads the roster-moved line instead.
    const ownerId = idOf(owner.email);
    const refusal = await page.evaluate(
      async ({ member, reason }) => {
        const mint = await fetch("/api/tap/options", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "Changed a role", target: member, value: "admin", reason }),
        });
        const patch = await fetch("/api/team/member", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ member, role: "admin", reason }),
        });
        return { minted: mint.status, status: patch.status, body: await patch.text() };
      },
      { member: ownerId, reason: "Proving the last-Owner floor is the database's." },
    );
    expect(refusal.minted, "the challenge mints -- the bypass gets that far").toBe(200);
    expect(refusal.status, `PATCH answered ${refusal.status}: ${refusal.body}`).not.toBe(200);
    expect(refusal.body, "the roster-moved line, so it was the floor that refused and not the missing tap").toContain(
      "The team has changed since this page loaded.",
    );
    expect(roleOf(owner.email), "still an Owner").toBe("owner");
    expect(auditCount(ownerId, "Changed a role", owner.email), "and nothing in the audit log").toBe("0");
  });

  /**
   * The long journey, and four of the five digests: an Owner invites an Admin, the letter reaches
   * them, they accept and set up on a device of their own, and then their role, their keys and
   * their access are each taken with a real tap. Every mismatch between the browser's mint and the
   * database's re-digest lands as a refusal and a row that does not move, so every "it worked"
   * below is an assertion about the two halves agreeing.
   */
  test("an Owner invites a member, and a role change, a key reset and a removal each spend a real tap", async ({ page, baseURL }) => {
    const base = baseURL ?? BASE;
    const owner = await setUpFirstOwner(page, base);
    const email = freshAddress("kiran");
    const name = ownerIdentity(email).name;
    await gotoReady(page, "/team");

    // --- Invite (digest 1: the lower-cased address, and the role). ---
    await page.getByRole("button", { name: "Invite a member" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Invite a member" });
    // The sheet's own default is the only choice drawn checked (:217).
    await expect(dialog.getByRole("radio", { name: "Support" })).toBeChecked();
    await expect(dialog.getByText("The invite lasts 7 days. It can't go to an address that already has a Trakline account.")).toBeVisible();
    await dialog.getByLabel("Email").fill(email.toUpperCase());
    await dialog.getByRole("radio", { name: "Admin" }).click();
    await dialog.getByRole("button", { name: "Continue" }).click();
    // TC-01's bold line carries the address the tap is minted over -- lower-cased, because
    // console_invite_member digests `lower(p_email)` and a capital would spend against a digest
    // the tap was never taken for (task-4-addendum.md §4). Typed in capitals above for exactly that.
    await expect(page.getByRole("dialog", { name: "Confirm it's you" })).toContainText(`Invite ${email}`);
    await tapThrough(page, "Joining the support rota this week.");
    await expect(page.getByText("Invite sent · logged")).toBeVisible();
    await expect(invitesTable(page).getByRole("row").filter({ hasText: email })).toContainText("Admin");

    const ownerId = idOf(owner.email);
    expect(auditCount(ownerId, "Invited a member", email), "the invite's own audit row").toBe("1");

    // --- The member's own half, on a device of their own. ---
    const browser = page.context().browser();
    if (!browser) throw new Error("no browser instance available for a fresh context");
    const theirs = await browser.newContext();
    const them = await theirs.newPage();
    const invite = await letterFor(them, email, "You're invited to the Trakline console");
    expect(invite.text, "the letter names the role they were invited as").toContain("as Admin");
    await them.goto(linkIn(invite.text, "setup"));
    await them.getByRole("button", { name: "Accept and email me a sign-in link" }).click();
    await expect(them.getByText("Check your inbox. Open the link on the device you'll set up.")).toBeVisible();

    const signIn = await letterFor(them, email, "Your Trakline console sign-in link");
    await them.goto(linkIn(signIn.text, "auth/confirm"));
    const theirFirstKey = await addVirtualKey(them, "usb");
    await expect(them.getByRole("heading", { name: "Add your first key" })).toBeVisible();
    await them.getByLabel("Name this key").fill("YubiKey 5C");
    await them.getByRole("button", { name: "Add key" }).click();
    await expect(them.getByRole("heading", { name: "Add a second key" })).toBeVisible();
    await swapAuthenticatorAfterTap(them, theirFirstKey, "internal");
    await them.getByLabel("Name this key").fill("iPhone");
    await them.getByRole("button", { name: "Add key" }).click();
    await them.getByRole("button", { name: "Open the console" }).click();
    await expectSignedInAs(them, name, "Admin");

    // The rail an Admin is allowed: nothing. 13 Team is the only built module and it is Owner-only,
    // so ConsoleFrame draws neither the rail nor the phone drawer's trigger, and /team itself
    // answers with the sheet's no-access state rather than a redirect (task-3-addendum.md §4).
    await expect(them.getByRole("navigation", { name: "Console" })).toHaveCount(0);
    await expect(them.getByRole("link", { name: "Team", exact: true })).toHaveCount(0);
    await gotoReady(them, "/team");
    await expect(them.getByText("This module isn't part of the Admin role.")).toBeVisible();
    await expect(them.getByText("Ask an Owner if you need it.")).toBeVisible();
    await expect(them.getByRole("region", { name: "Console members", exact: true })).toHaveCount(0);
    await theirs.close();

    // --- Change role (digest 2: the member's id, and the NEW role). ---
    await gotoReady(page, "/team");
    await expect(page.getByText("2 members")).toBeVisible();
    const theirRow = membersTable(page).getByRole("row").filter({ hasText: email });
    await expect(theirRow).toContainText("2 keys");
    await expect(theirRow).toContainText("Active");

    await rowMenu(page, name, "Change role");
    const picker = page.getByRole("dialog", { name: `Change ${name}'s role` });
    await expect(picker).toBeVisible();
    // The role they already hold is left out -- changing a role to itself is not a change.
    await expect(picker.getByRole("radio", { name: "Admin" })).toHaveCount(0);
    await expect(picker.getByRole("radio")).toHaveCount(3);
    await picker.getByRole("radio", { name: "Support" }).click();
    await picker.getByRole("button", { name: "Continue" }).click();
    // The sheet names the member twice and differently: the full name in the bold line, the first
    // name in the hint below it (ConsoleTeam.dc.html:265/:267).
    const tc01 = page.getByRole("dialog", { name: "Confirm it's you" });
    await expect(tc01).toContainText(`Change ${name}'s role`);
    await expect(tc01).toContainText("Role: Admin → Support");
    await expect(tc01).toContainText(`${name.split(" ")[0]} is signed out everywhere at once and signs in again with the new role.`);
    await tapThrough(page, "Moving them to the support rota.");
    await expect(page.getByText("Role changed · logged")).toBeVisible();
    await expect(theirRow).toContainText("Support");
    expect(roleOf(email), "the database agrees").toBe("support");
    expect(auditCount(ownerId, "Changed a role", email), "the change's own audit row").toBe("1");

    // --- Reset keys (digest 3: the member's id, and the key count as text). ---
    // The count the page rendered is what the tap is minted over, and console_reset_keys recounts
    // inside its own transaction. This is the one digest whose `value` is neither an id nor an
    // enum, and the one a stale page genuinely breaks.
    await rowMenu(page, name, "Reset keys");
    const resetDialog = page.getByRole("dialog", { name: "Confirm it's you" });
    await expect(resetDialog).toContainText(`Reset ${name}'s keys`);
    await expect(resetDialog).toContainText(`${name.split(" ")[0]} is signed out everywhere and will add two new keys at next sign-in.`);
    await tapThrough(page, "Their laptop was stolen at the airport.");
    // The count is the server's own, returned by console_reset_keys, never the number this page
    // happened to be showing.
    await expect(page.getByText("2 keys removed · logged")).toBeVisible();
    await expect(theirRow).toContainText("0 keys");
    expect(consoleSql(`select count(*) from console.keys where member_id = '${idOf(email)}'`), "every key gone").toBe("0");
    expect(auditCount(ownerId, "Reset a member's keys", email), "the reset's own audit row").toBe("1");

    // --- Remove (digest 4: the member's id, and the role they hold TODAY). ---
    // Their role moved once already in this test, so a mint over the role the page first rendered
    // would fail here. It is read from the refreshed row, which is the point.
    const theirId = idOf(email);
    await rowMenu(page, name, "Remove");
    const removeDialog = page.getByRole("dialog", { name: "Confirm it's you" });
    await expect(removeDialog).toContainText(`Remove ${name} from the console`);
    await expect(removeDialog).toContainText(`${name.split(" ")[0]} is signed out everywhere at once.`);
    await tapThrough(page, "They have left the company.");
    await expect(page.getByText("Member removed · logged")).toBeVisible();
    await expect(theirRow).toHaveCount(0);
    await expect(page.getByText("You're the only member.")).toBeVisible();
    // A soft delete: the row stays, so the audit trail naming them still resolves.
    expect(consoleSql(`select status from console.members where user_id = '${theirId}'`)).toBe("removed");
    expect(auditCount(ownerId, "Removed a member", email), "the removal's own audit row").toBe("1");
  });

  /**
   * The invite row's two actions, which are deliberately asymmetric because the database is: a
   * resend changes no access and takes no tap, while a revocation withdraws access an Owner granted
   * and `console_revoke_invite` requires one (task-7-addendum.md §3).
   */
  test("an invite is resent without a tap, even once expired, and revoked with one", async ({ page, baseURL }) => {
    const base = baseURL ?? BASE;
    const owner = await setUpFirstOwner(page, base);
    const email = freshAddress("priya");
    await gotoReady(page, "/team");
    await inviteMember(page, email, "Viewer", "Read-only access for the audit.");
    await expect(page.getByText("Invite sent · logged")).toBeVisible();
    const firstLetter = await letterFor(page, email, "You're invited to the Trakline console");
    const firstLink = linkIn(firstLetter.text, "setup");

    const inviteRow = invitesTable(page).getByRole("row").filter({ hasText: email });
    await expect(inviteRow).toContainText("Viewer");
    const inviteId = consoleSql(`select id from console.invites where email = '${email}' and revoked_at is null`);

    // Expired on purpose. An expired invite is resendable, and that is a decision rather than an
    // oversight: console_invites_live_email_idx holds the address while an invite is neither
    // accepted nor revoked, and expiry does not release it -- refusing here would leave an Owner
    // unable to resend and unable to re-invite (task-7-addendum.md §1). `created_at` moves with it,
    // because console_invites_expiry_window checks `expires_at > created_at`.
    consoleSql(`update console.invites set created_at = now() - interval '8 days', expires_at = now() - interval '2 days' where id = '${inviteId}'`);
    await gotoReady(page, "/team");
    await inviteRow.getByRole("button", { name: "Resend" }).click();
    const resend = page.getByRole("alertdialog", { name: "Resend the invite?" });
    await expect(resend).toContainText(`${email} gets a new link that lasts 7 days. The old link stops working.`);
    // A plain confirmation: no reason field, no tap, no TC-01 behind it.
    await expect(resend.getByRole("button", { name: "Tap your key" })).toHaveCount(0);
    await resend.getByRole("button", { name: "Resend" }).click();
    await expect(page.getByText("Invite resent · logged")).toBeVisible();

    // Expiry pushed out, and a fresh token in the letter. The token itself is never read here or
    // compared as a string: it is a console-access credential, and a failing assertion prints what
    // it was given. The link either changed or it did not, which is the whole claim.
    expect(consoleSql(`select expires_at > now() + interval '6 days' from console.invites where id = '${inviteId}'`), "live again, for 7 days").toBe("t");
    const second = await letterFor(page, email, "You're invited to the Trakline console");
    expect(linkIn(second.text, "setup") === firstLink, "the second letter carries a fresh token, not the spent one").toBe(false);
    expect(auditCount(idOf(owner.email), "Resent an invite", email), "the resend's own audit row").toBe("1");

    // --- Revoke (digest 5: the invite's id, and the address the database reads for it). ---
    await inviteRow.getByRole("button", { name: "Revoke" }).click();
    const revoke = page.getByRole("dialog", { name: "Confirm it's you" });
    await expect(revoke).toContainText("Revoke the invite?");
    await expect(revoke).toContainText(`The link sent to ${email} stops working at once.`);
    await tapThrough(page, "Sent to the wrong address.");
    await expect(page.getByText("Invite revoked · logged")).toBeVisible();
    await expect(inviteRow).toHaveCount(0);
    expect(consoleSql(`select revoked_at is not null from console.invites where id = '${inviteId}'`)).toBe("t");
    expect(auditCount(idOf(owner.email), "Revoked an invite", email), "the revocation's own audit row").toBe("1");
  });

  /**
   * The tap, proven the way it was broken (my-keys.spec.ts's own second test, one action along).
   * Every authenticator is detached first, so nothing in this browser *could* have answered even if
   * something had asked it to, and then the two plain fetches a bypass takes -- mint a challenge,
   * call the action -- run with no /api/tap/verify in between.
   *
   * The target is a member who accepted their invite and has yet to add a key: `console_change_role`
   * needs a row with a role, and nothing about the refusal below depends on their keys.
   */
  test("a tap no key ever answered cannot change a role", async ({ page, baseURL }) => {
    const base = baseURL ?? BASE;
    const owner = await setUpFirstOwner(page, base);
    const email = freshAddress("asha");
    await gotoReady(page, "/team");
    await inviteMember(page, email, "Support", "Covering the privacy queue.");

    const browser = page.context().browser();
    if (!browser) throw new Error("no browser instance available for a fresh context");
    const theirs = await browser.newContext();
    const them = await theirs.newPage();
    const invite = await letterFor(them, email, "You're invited to the Trakline console");
    await them.goto(linkIn(invite.text, "setup"));
    await them.getByRole("button", { name: "Accept and email me a sign-in link" }).click();
    await expect(them.getByText("Check your inbox. Open the link on the device you'll set up.")).toBeVisible();
    await theirs.close();

    await gotoReady(page, "/team");
    const theirRow = membersTable(page).getByRole("row").filter({ hasText: email });
    await expect(theirRow).toContainText("Setup incomplete");

    // Gone, not merely switched off: `setUpFirstOwner` leaves the first key present-disabled, and a
    // spec proving an action cannot happen without a ceremony has to say the stronger thing.
    await owner.firstKey.remove();
    await owner.secondKey.remove();

    const memberId = idOf(email);
    const reason = "Proving a role change cannot skip its tap.";
    const bypass = await page.evaluate(
      async ({ member, why }) => {
        const mint = await fetch("/api/tap/options", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "Changed a role", target: member, value: "owner", reason: why }),
        });
        const patch = await fetch("/api/team/member", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ member, role: "owner", reason: why }),
        });
        return { minted: mint.status, status: patch.status, body: await patch.text() };
      },
      { member: memberId, why: reason },
    );

    expect(bypass.minted, "the tap is minted -- the bypass gets as far as a real challenge").toBe(200);
    expect(bypass.status, `PATCH /api/team/member answered ${bypass.status}: ${bypass.body}`).not.toBe(200);
    // console.use_tap's own refusal, mapped: the challenge exists and its digest matches, and it is
    // rejected because no assertion was ever recorded against it. That is the exact defect
    // final-fix.md §1 found -- a tap verified and then not recorded, which let two plain fetches
    // through -- and this is the assertion that fails if it ever comes back.
    expect(bypass.body, "the stale-tap line, so it was use_tap that refused").toContain("That confirmation no longer matches this change.");
    expect(roleOf(email), "still Support").toBe("support");
    expect(auditCount(idOf(owner.email), "Changed a role", email), "and nothing was written to the audit log").toBe("0");

    // The page a member would actually see, re-read from the server.
    await gotoReady(page, "/team");
    await expect(theirRow).toContainText("Support");
  });
});
