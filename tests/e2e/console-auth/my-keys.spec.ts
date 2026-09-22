import { chooseKeyKind, consoleSql, expect, expectSignedInAs, readOutbox, resetConsole, setUpFirstOwner, swapAuthenticatorAfterTap, test, type VirtualKey } from "./fixtures";
import { gotoReady } from "../helpers";

const BASE = "http://admin.localhost:4211";

test.beforeEach(() => resetConsole());

/**
 * My keys, end to end (task-11, spec §D): the one place every half of the tap's own agreement meets
 * for real. `console_remove_key` re-digests `('Removed a key', p_key::text, count(*) - 1, <reason>)`
 * from the database's own count; ConfirmItsYou mints a tap over the very same four fields, with
 * `target` the row's id (never its name -- two keys may share one) and `value` computed by KeysPlate
 * as `String(keys.length - 1)`, the client's own count from whatever the last GET /api/keys/mine
 * returned. supabase/tests/console_my_keys.test.sql proves the SQL side
 * alone, against a hand-computed digest; tests/unit/console/account/keys-plate.test.tsx proves the
 * client's arithmetic alone, against a mocked runTap and removeKey. Neither can prove the two sides
 * agree -- the mock is exactly where they are cut apart. Removing the third key below drives a real
 * tap through the real browser, a real /api/tap/options mint, a real WebAuthn assertion and a real
 * /api/tap/verify, then a real DELETE that runs console_remove_key for real: if the client's
 * `keys.length - 1` and the database's own `count(*) - 1` ever disagreed, console.use_tap finds no
 * challenge whose digest matches and raises "no tap for this action" (42501) -- surfaced here as
 * removeKey's own outcome, the key staying in the table and no "Key removed · logged" toast, not a
 * mocked assertion that a function was called with the right arguments.
 */
test.describe("My keys", () => {
  test("a member views, adds, renames and removes a key, and is refused at the two-key floor", async ({ page, baseURL }) => {
    const base = baseURL ?? BASE;
    const owner = await setUpFirstOwner(page, base);
    await expectSignedInAs(page, owner.name, owner.role);

    // --- View: both keys, their types, and the profile (spec's first bullet). ---
    await expect(page.getByRole("heading", { level: 1, name: "My keys" })).toBeVisible();
    await expect(page.getByText("2 keys")).toBeVisible();
    const firstRow = page.getByRole("row").filter({ hasText: "YubiKey 5C" });
    const secondRow = page.getByRole("row").filter({ hasText: "iPhone" });
    await expect(firstRow).toBeVisible();
    await expect(secondRow).toBeVisible();
    // console_my_keys returns oldest first (supabase/migrations/20260921100000_console_my_keys.sql's
    // own tiebreaker note) -- the first key registered during setup heads the table, right after the
    // header row (also role="row").
    await expect(page.getByRole("row").nth(1)).toContainText("YubiKey 5C");
    // Both a type label and a role badge read "Security key"/"Owner" elsewhere on this same page
    // (the masthead's own member menu draws the role too), so the profile's own three fields are
    // read from its own region (Plate's aria-labelledby, ProfilePlate's titleId="mk-profile"), not
    // the bare page.
    const profile = page.getByRole("region", { name: "Profile" });
    await expect(profile.getByText(owner.name)).toBeVisible();
    await expect(profile.getByText(owner.email)).toBeVisible();
    await expect(profile.getByText("Owner", { exact: true })).toBeVisible();

    // --- Add a third key through the drawn dialog, the tap-then-register two-step. ---
    // task-11-addendum.md §1's own hazard, one key later than setUpFirstOwner's: /api/keys/options
    // answers "tap" first (the member already holds two keys), then the register step's own
    // excludeCredentials names both of them -- owner.secondKey is the one currently present, so it is
    // the one that must be swapped out before that second ceremony, not re-derived, the same rule
    // swapAuthenticatorAfterTap's own doc comment states.
    let thirdKey: VirtualKey | undefined;
    await page.getByRole("button", { name: "Add a key" }).click();
    const addDialog = page.getByRole("dialog", { name: "Add a key" });
    await expect(addDialog).toBeVisible();
    await chooseKeyKind(addDialog, "usb");
    await addDialog.getByLabel("Name this key").fill("YubiKey 5 NFC");
    await swapAuthenticatorAfterTap(page, owner.secondKey, "usb", (next) => {
      thirdKey = next;
    });
    await addDialog.getByRole("button", { name: "Add a key" }).click();
    await expect(addDialog).not.toBeVisible();
    await expect(page.getByText("3 keys")).toBeVisible();
    const thirdRow = page.getByRole("row").filter({ hasText: "YubiKey 5 NFC" });
    await expect(thirdRow).toBeVisible();
    expect(thirdKey, "the exclude-credentials swap never fired for the third key").toBeDefined();

    // --- Rename a key, and the new name surviving a reload. ---
    await firstRow.getByRole("button", { name: "Rename" }).click();
    const renameDialog = page.getByRole("dialog", { name: "Rename" });
    await expect(renameDialog).toBeVisible();
    await renameDialog.getByLabel("Name this key").fill("Desk YubiKey");
    await renameDialog.getByRole("button", { name: "Rename" }).click();
    await expect(renameDialog).not.toBeVisible();
    await expect(page.getByText("Desk YubiKey")).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: "YubiKey 5C" })).toHaveCount(0);
    await gotoReady(page, "/");
    await expect(page.getByRole("heading", { level: 1, name: "My keys" })).toBeVisible();
    await expect(page.getByText("Desk YubiKey")).toBeVisible();

    // --- Remove the third key: a short reason is refused in place, a valid one plus a tap removes
    // it, and the audit row is there. ---
    // `thirdRow` (declared above) is lazy -- re-queried on every use, not a snapshot from when it was
    // first defined -- so it still finds this same row after the reload just above.
    await thirdRow.getByRole("button", { name: "Remove" }).click();
    const confirmDialog = page.getByRole("dialog", { name: "Confirm it's you" });
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByText("Remove YubiKey 5 NFC")).toBeVisible();
    await expect(confirmDialog.getByText("Keys: 3 → 2")).toBeVisible();

    const reasonField = confirmDialog.getByLabel("Reason");
    await reasonField.fill("short");
    await confirmDialog.getByRole("button", { name: "Tap your key" }).click();
    await expect(confirmDialog.getByRole("alert")).toHaveText("Add a reason of at least 10 characters.");
    // Refused client-side, before any ceremony: the dialog stays open and the tap button never
    // reads "Waiting for your key…", the one visible sign a ceremony began.
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog.getByRole("button", { name: "Tap your key" })).toBeVisible();

    await reasonField.fill("Left at the old office; replaced.");
    await confirmDialog.getByRole("button", { name: "Tap your key" }).click();
    await expect(confirmDialog).not.toBeVisible();
    await expect(page.getByText("Key removed · logged")).toBeVisible();
    await expect(page.getByText("2 keys")).toBeVisible();
    await expect(thirdRow).toHaveCount(0);

    // Scoped to this run's own actor, not just action/target/reason: the audit log is append-only
    // (resetConsole's own comment -- it holds no foreign keys and survives every reset), so a bare
    // count would grow across repeated runs against the same local database and this exact assertion
    // would fail on a second run for a reason with nothing to do with the removal itself.
    const memberId = consoleSql(`select user_id from console.members where email = '${owner.email}'`);
    const removalLogged = consoleSql(
      `select count(*) from console.audit_log where actor_id = '${memberId}' and action = 'Removed a key' and target = 'YubiKey 5 NFC' and reason = 'Left at the old office; replaced.'`,
    );
    expect(removalLogged, "the removal's own audit row").toBe("1");

    // --- Removing down to one key is refused with the sheet's own line. ---
    // Reached honestly here, not fabricated: this is the real two-key state a real removal above
    // just produced, re-read from the server (fetchMyKeys, after the removal's own refresh), not a
    // client guess -- removeDisabled (keys-plate.tsx) is exactly this same `keys.length <= 2`.
    const removeButtons = page.getByRole("button", { name: "Remove" });
    await expect(removeButtons).toHaveCount(2);
    for (const button of await removeButtons.all()) await expect(button).toBeDisabled();
    await expect(page.getByText("You need at least two keys. Add another before removing one.")).toBeVisible();
  });

  /**
   * The tap, proven the way it was broken (final-fix.md §1). Every unit test in this repository
   * mocks either the ceremony or the database, and 1149 of them saw nothing: `verifyTap` verified a
   * real assertion and then recorded nothing about it, so `console.use_tap` had no fact to check and
   * two plain fetches -- mint a challenge, call the action -- removed a key with no WebAuthn
   * ceremony at all, logging it as a genuine tap. This spec is that exact sequence, run against the
   * real routes and the real database with every virtual authenticator detached, so nothing in the
   * browser *could* have answered even if something had asked it to.
   *
   * Two challenges are minted, one over the key's id and one over its name, because the digest's
   * `target` changed from the name to the id in the same round of fixes (final-fix.md §2). Whichever
   * of the two `console_remove_key` re-digests, a digest-matching tap is waiting for it -- so the
   * refusal below can only ever be about the missing ceremony, never about a digest that happened
   * not to line up. That is what makes this spec fail against the unfixed code rather than pass for
   * the wrong reason.
   */
  test("a tap no key ever answered cannot remove a key", async ({ page, baseURL }) => {
    const base = baseURL ?? BASE;
    const owner = await setUpFirstOwner(page, base);
    await expectSignedInAs(page, owner.name, owner.role);

    // A third key, so the two-key floor is not what refuses the removal below and the refusal can
    // only be the missing tap. Added through the drawn dialog, the same way the test above does it.
    let thirdKey: VirtualKey | undefined;
    await page.getByRole("button", { name: "Add a key" }).click();
    const addDialog = page.getByRole("dialog", { name: "Add a key" });
    await expect(addDialog).toBeVisible();
    await chooseKeyKind(addDialog, "usb");
    await addDialog.getByLabel("Name this key").fill("YubiKey 5 NFC");
    await swapAuthenticatorAfterTap(page, owner.secondKey, "usb", (next) => {
      thirdKey = next;
    });
    await addDialog.getByRole("button", { name: "Add a key" }).click();
    await expect(addDialog).not.toBeVisible();
    await expect(page.getByText("3 keys")).toBeVisible();
    expect(thirdKey, "the exclude-credentials swap never fired for the third key").toBeDefined();

    // Every authenticator gone -- not merely switched off. From here the browser has no key to tap,
    // so anything this member manages to do is something done without one.
    await owner.firstKey.remove();
    await owner.secondKey.remove();
    await thirdKey?.remove();

    const memberId = consoleSql(`select user_id from console.members where email = '${owner.email}'`);
    const keyId = consoleSql(`select id from console.keys where member_id = '${memberId}' and name = 'YubiKey 5 NFC'`);
    expect(keyId, "the third key's own row").toBeTruthy();
    const reason = "Proving a removal cannot skip its tap.";

    // Fetch 1 (twice, once per candidate digest target). Same origin, same session cookie, same
    // route the dialog itself calls -- the only thing missing is the ceremony between the two.
    const minted = await page.evaluate(
      async ({ targets, value, reason: why }) => {
        const statuses: number[] = [];
        for (const target of targets) {
          const response = await fetch("/api/tap/options", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "Removed a key", target, value, reason: why }),
          });
          statuses.push(response.status);
        }
        return statuses;
      },
      { targets: [keyId, "YubiKey 5 NFC"], value: "2", reason },
    );
    expect(minted, "both taps were minted -- the bypass gets as far as a real challenge").toEqual([200, 200]);

    // Fetch 2: the action itself, with no /api/tap/verify in between.
    const removal = await page.evaluate(
      async ({ id, reason: why }) => {
        const response = await fetch("/api/keys/mine", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ keyId: id, reason: why }),
        });
        return { status: response.status, body: await response.text() };
      },
      { id: keyId, reason },
    );

    expect(removal.status, `DELETE /api/keys/mine answered ${removal.status}: ${removal.body}`).not.toBe(200);
    expect(consoleSql(`select count(*) from console.keys where id = '${keyId}'`), "the key is still there").toBe("1");
    expect(consoleSql(`select count(*) from console.keys where member_id = '${memberId}'`), "and the member still holds all three").toBe("3");
    // The audit log is where this was worst: the unfixed console wrote `result = 'done'` for a
    // removal no key ever approved. Scoped to this run's own actor, for the same reason the counts
    // in the test above are -- console.audit_log survives resetConsole().
    expect(
      consoleSql(`select count(*) from console.audit_log where actor_id = '${memberId}' and action = 'Removed a key'`),
      "and nothing was written to the audit log",
    ).toBe("0");

    // Re-read from the server, not just the database: the page a member would actually see still
    // shows three keys.
    await gotoReady(page, "/");
    await expect(page.getByText("3 keys")).toBeVisible();
  });

  /**
   * A second, genuinely separate `console.sessions` row: opening a real sign-in link in a second
   * browser context, exactly as far as `src/app/console/auth/confirm/route.ts`'s own comment says a
   * link alone ever gets ("the session is not key-verified yet") -- no second WebAuthn ceremony is
   * attempted here, and none is needed. `console_my_sessions` deliberately includes a session that
   * never completed key verification (task-9-addendum.md §3, my-sessions.ts's own comment on
   * getMySessions), so this second context's session is exactly the kind of row the Sessions plate
   * must be able to list and this test's own removal button must be able to sign out -- a real
   * fixture of the console's own making, not a row inserted by hand the way
   * console_my_keys.test.sql's pgTAP equivalent does it.
   */
  test("signing out other sessions leaves this one signed in", async ({ page, baseURL }) => {
    const base = baseURL ?? BASE;
    const owner = await setUpFirstOwner(page, base);

    const browserInstance = page.context().browser();
    if (!browserInstance) throw new Error("no browser instance available for a fresh context");
    const otherContext = await browserInstance.newContext();
    const otherPage = await otherContext.newPage();
    await otherPage.goto(`${base}/login`);
    await otherPage.getByLabel("Console email").fill(owner.email);
    await otherPage.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(otherPage.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

    let found: Awaited<ReturnType<typeof readOutbox>> = [];
    await expect
      .poll(
        async () => {
          found = await readOutbox(otherPage, owner.email);
          return found.length;
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
    const link = /https?:\/\/\S+\/auth\/confirm\S+/.exec(found[0]?.text ?? "")?.[0];
    expect(link, `no confirm link in: ${found[0]?.text}`).toBeTruthy();
    await otherPage.goto(String(link));
    // The link alone lands on the key step (sign-in.spec.ts's own "the link alone opens nothing"),
    // never signed in -- confirming that here would only restate that test; what this one needs is
    // just the session row the confirm route already opened by this point.
    await expect(otherPage.getByRole("heading", { level: 1, name: "Your key" })).toBeVisible();

    // Back on the first device: the Sessions plate now has something to sign out. Re-read from the
    // server -- a client-side poll would only prove this page's own state, not that the second
    // session genuinely exists in the database.
    await gotoReady(page, "/");
    await expect(page.getByRole("button", { name: "Sign out other sessions" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out other sessions" }).click();
    // ConfirmDialog (src/components/ui/confirm-dialog.tsx) is Base UI's AlertDialog, not Dialog --
    // role="alertdialog", unlike every dialog above this line in the other test.
    const confirmDialog = page.getByRole("alertdialog", { name: "Sign out other sessions?" });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Sign out others" }).click();
    await expect(page.getByText("Other sessions signed out · logged")).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out other sessions" })).not.toBeVisible();

    // The database, not just this page's own re-fetch: exactly one of this member's sessions is
    // revoked (the other device), and exactly one is not (this one) -- console_my_keys.test.sql's own
    // "Signing the others out" pgTAP check, proven here through the real route instead of a direct
    // RPC call.
    const memberId = consoleSql(`select user_id from console.members where email = '${owner.email}'`);
    expect(memberId, "the owner's own member row").toBeTruthy();
    const revoked = consoleSql(`select count(*) from console.sessions where member_id = '${memberId}' and revoked_at is not null`);
    const live = consoleSql(`select count(*) from console.sessions where member_id = '${memberId}' and revoked_at is null`);
    expect(revoked, "the other device's session").toBe("1");
    expect(live, "this device's own session").toBe("1");

    // This device is untouched -- re-read from the server, not merely still true in memory.
    await gotoReady(page, "/");
    await expectSignedInAs(page, owner.name, owner.role);

    await otherContext.close();
  });
});
