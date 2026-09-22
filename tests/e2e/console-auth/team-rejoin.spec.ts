import { consoleSql, expect, ownerIdentity, resetConsole, setUpFirstOwner, test } from "./fixtures";
import { freshAddress, idOf, inviteMember, joinFromInvite, keyCountOf, membersTable, roleOf, rowMenu, tapThrough } from "./team-helpers";
import { gotoReady } from "../helpers";

/**
 * Removal, re-invitation, and the sign-in that follows it.
 *
 * This is the one path on this branch that no test signed a member in along, and the whole-branch
 * review found it broken because of that. Ruling 17 opened it deliberately -- the owner ruled that
 * removal must not be permanent, and `console_invite_member` exempts an address whose only
 * console.members row is 'removed' -- but removal left `console.keys` alone, so the member who came
 * back was locked out of every console page, permanently, with nothing on screen and nothing on the
 * Owner's roster to say so. `20260922130000_console_remove_member_clears_keys.sql` carries the full
 * five-step trace; this file is what holds the fix.
 *
 * Nine per-task reviews missed it because each owned one end: Task 4 proved the invite is allowed,
 * Task 2b proved the accept succeeds, and neither followed the member into a sign-in. So the test
 * has to be the whole journey, twice through the member's half -- there is no cheaper shape that
 * would have caught it. Two full enrolments and two taps are why it asks for its own timeout.
 *
 * Its own file rather than a fifth test in team.spec.ts, which is already at its length budget.
 * Nothing in this directory depends on where it sorts any more: the console is emptied after the
 * whole run by ./global-teardown.ts, so neither this file nor team.spec.ts carries an `afterAll`.
 */

const BASE = "http://admin.localhost:4211";

test.beforeEach(() => resetConsole());

test.describe("Team: a removed member comes back", () => {
  // Two complete key enrolments (each: a link, a registration, a tap and a second registration),
  // plus an invite tap, a removal tap and a second invite tap. The default 30s is for a test that
  // does one of those.
  test.setTimeout(240_000);

  test("removal takes a member's keys with it, so a re-invite reaches the console rather than a dead end", async ({ page, baseURL }) => {
    const base = baseURL ?? BASE;
    const owner = await setUpFirstOwner(page, base);
    const email = freshAddress("kiran");
    const name = ownerIdentity(email).name;
    const browser = page.context().browser();
    if (!browser) throw new Error("no browser instance available for a fresh context");
    await gotoReady(page, "/team");

    // --- They join once, as an Admin, and hold the two keys an active member must have. ---
    await inviteMember(page, email, "Admin", "Joining the support rota this week.");
    await expect(page.getByText("Invite sent · logged")).toBeVisible();
    await joinFromInvite(browser, email, "Admin");

    await gotoReady(page, "/team");
    const theirId = idOf(email);
    const theirRow = membersTable(page).getByRole("row").filter({ hasText: email });
    await expect(theirRow).toContainText("Active");
    await expect(theirRow).toContainText("2 keys");
    expect(keyCountOf(theirId), "two keys on the row before the removal").toBe("2");

    // --- Removed. The row survives as a soft delete; the credentials do not. ---
    await rowMenu(page, name, "Remove");
    await expect(page.getByRole("dialog", { name: "Confirm it's you" })).toContainText(`Remove ${name} from the console`);
    await tapThrough(page, "They have left the company.");
    await expect(page.getByText("Member removed · logged")).toBeVisible();
    await expect(page.getByText("You're the only member.")).toBeVisible();
    expect(consoleSql(`select status from console.members where user_id = '${theirId}'`), "a soft delete: the row stays").toBe("removed");
    expect(keyCountOf(theirId), "and every key they held is gone").toBe("0");

    // --- Invited back, on the same address, as something else. ---
    await inviteMember(page, email, "Viewer", "Coming back part-time for the audit.");
    await expect(page.getByText("Invite sent · logged")).toBeVisible();

    // The whole point. Before the fix this reached /sign-in-key on the strength of two keys still
    // sitting on the row, `console_auth_activate_member` was never called, and every console page
    // answered "Your session ended" -- so the assertion that matters is not that the invite was
    // allowed (Task 4 already proved that) but that the member ends up *inside*.
    await joinFromInvite(browser, email, "Viewer");

    expect(idOf(email), "the same row, reactivated rather than a second one").toBe(theirId);
    expect(consoleSql(`select status from console.members where user_id = '${theirId}'`), "active, not stranded in setup").toBe("active");
    expect(roleOf(email), "the new invite's role wins over the one they were removed with").toBe("viewer");
    expect(keyCountOf(theirId), "two keys, and they are the fresh ones").toBe("2");

    // And the Owner's roster says the same thing, which is the other half of the silence: before
    // the fix this row read "Setup incomplete · 2 keys" forever, indistinguishable from anyone
    // mid-setup.
    await gotoReady(page, "/team");
    const rejoined = membersTable(page).getByRole("row").filter({ hasText: email });
    await expect(rejoined).toContainText("Viewer");
    await expect(rejoined).toContainText("Active");
    await expect(rejoined).toContainText("2 keys");
    expect(owner.role, "the reader throughout was the console's Owner").toBe("Owner");
  });
});
