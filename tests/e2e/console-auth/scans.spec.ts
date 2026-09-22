import { consoleSql, expect, resetConsole, setUpFirstOwner, test } from "./fixtures";
import { freshAddress, idOf, invitesTable, membersTable } from "./team-helpers";
import { expectAxeClean, gotoReady } from "../helpers";
import { layoutBreaks } from "../layout";

const BASE = "http://admin.localhost:4211";

test.beforeEach(() => resetConsole());

/**
 * task-10-brief.md's own request -- extend the existing 390px scan (tests/e2e/console/scans.spec.ts)
 * to the signed-in frame -- can't be done in that file: it runs under `npm run test:e2e`
 * (playwright.config.ts), whose one shared webServer blanks NEXT_PUBLIC_SUPABASE_URL so the
 * traveller run never reaches a real project (that file's own comment). No session can ever be
 * signed in there, real or otherwise. A real session -- which a phone rendering of the signed-in
 * frame needs, per task-10-addendum.md §4 -- only exists under this directory's own
 * playwright.console.config.ts (`npm run test:e2e:console`), so this scan lives here instead, next
 * to sign-in.spec.ts and setup.spec.ts, under the same config rather than a third one
 * (task-10-addendum.md §4's own instruction).
 *
 * My keys, not Overview: it's what `/` lands on today (src/app/console/page.tsx), the only signed-in
 * page that exists yet, and the one task-10-addendum.md §2 asks this task to look at closely -- the
 * table-stack path that already produced one real bug on this branch (2c3929c, fixed before this
 * task's own BASE). layoutBreaks runs in a real Chromium layout, not jsdom -- see console-rail.test.tsx
 * for the reverse case (task-10-addendum.md §3): jsdom has no layout at all, so this file, not a
 * unit test, is where "no horizontal overflow" means anything.
 */
test.describe("the signed-in frame at 390px", () => {
  test("My keys, and the Add/Rename dialogs it opens, fit with no horizontal overflow", async ({ page, baseURL }) => {
    const owner = await setUpFirstOwner(page, baseURL ?? BASE);

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(page, "/");
    await expect(page.getByRole("heading", { level: 1, name: "My keys" })).toBeVisible();
    // The module rail was a moot check until 2d-2 task-8: every module shipped built: false
    // (task-10-addendum.md §1), so neither ConsoleRail nor its phone trigger rendered for any role
    // and there was nothing to assert. 13 Team is built now, and it is Owner-only -- so this Owner
    // is exactly the role that gets a rail, and this is the first real rendering of it at 390px.
    //
    // Below sm the desktop rail is `hidden` and the drawer's trigger takes its place in the
    // masthead's leading slot (console-rail.tsx's own note): the trigger is what should be here, not
    // a 240px column eating two thirds of a phone.
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Console" })).toBeHidden();
    expect(await layoutBreaks(page), "My keys at 390px").toEqual([]);
    await expectAxeClean(page);

    // The drawer itself: it lists Team, and it fits. jsdom has no layout at all
    // (console-rail.test.tsx's own note), so this is the only place "no horizontal overflow" means
    // anything for the rail.
    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Console" });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("link", { name: /Team/ })).toHaveAttribute("href", "/team");
    // The drawer slides in from `-translate-x-full` over --duration-slow (260ms), and `toBeVisible`
    // resolves the moment it is in the tree -- mid-slide, its box genuinely is off the left edge,
    // which layoutBreaks reports as "past the edge [-320, 0]". Measured once it has settled at the
    // edge, so the scan is about the layout rather than about which frame it caught.
    await expect.poll(async () => (await drawer.boundingBox())?.x).toBe(0);
    expect(await layoutBreaks(page), "the rail drawer at 390px").toEqual([]);
    await expectAxeClean(page);
    await drawer.getByRole("button", { name: "Close menu" }).click();
    await expect(drawer).not.toBeVisible();

    // Add a key (ConsoleMyKeys.dc.html's own dialog, task-10-addendum.md §2): opened, not completed
    // -- no ceremony needed to check its layout at this width.
    await page.getByRole("button", { name: "Add a key" }).click();
    const addDialog = page.getByRole("dialog", { name: "Add a key" });
    await expect(addDialog).toBeVisible();
    expect(await layoutBreaks(page), "Add a key dialog at 390px").toEqual([]);
    await addDialog.getByRole("button", { name: "Close" }).click();
    await expect(addDialog).not.toBeVisible();

    // Rename, the first row's own action.
    await page.getByRole("button", { name: "Rename" }).first().click();
    const renameDialog = page.getByRole("dialog", { name: "Rename" });
    await expect(renameDialog).toBeVisible();
    expect(await layoutBreaks(page), "Rename dialog at 390px").toEqual([]);
    await renameDialog.getByRole("button", { name: "Close" }).click();
    await expect(renameDialog).not.toBeVisible();

    // Owner is the one role the profile plate draws a fourth plate for (the "If you lose your keys"
    // note, task-6-addendum.md §2) -- setUpFirstOwner's own member is always the first Owner, so this
    // run already covers the widest version of the page without a second sign-in.
    expect(owner.role).toBe("Owner");
  });

  /**
   * /team, the page this scan never opened. That omission is the whole reason the build shipped
   * the entire management surface at 390px against a phone sheet that deliberately draws none of
   * it -- eight controls the desktop sheet draws and ConsoleTeamPhone.dc.html does not, plus one
   * sentence (:85) that appeared nowhere in src/. The gap could reopen the moment /team is out of
   * this file, so it is in it.
   *
   * The invite row is written straight into console.invites rather than sent through TC-04 and a
   * real tap: this is a layout and affordance scan, the ceremony is proven five ways over in
   * team.spec.ts and team-rejoin.spec.ts, and a scan that spends a minute on WebAuthn is a scan
   * people stop running. `console.invites.invited_by` cascades from console.members, so
   * `resetConsole()` still clears it.
   */
  test("Team at 390px shows the phone sheet's notice and none of the management surface", async ({ page, baseURL }) => {
    const owner = await setUpFirstOwner(page, baseURL ?? BASE);
    const invited = freshAddress("priya");
    consoleSql(
      `insert into console.invites (email, role, invited_by, token_hash, sent_at, expires_at)
       values ('${invited}', 'support', '${idOf(owner.email)}', extensions.digest('${invited}', 'sha256'), now(), now() + interval '7 days')`,
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(page, "/team");
    await expect(page.getByRole("heading", { level: 1, name: "Team" })).toBeVisible();

    // ConsoleTeamPhone.dc.html:85, in the place the sheet puts it.
    await expect(page.getByText("Open on a larger screen to manage the team.")).toBeVisible();

    // And none of what the desktop sheet draws. Counted through `getByRole`, which is the point
    // rather than an implementation detail: role queries skip what is out of the accessibility
    // tree, and `display: none` takes these out of it and out of the tab order together. So this
    // asserts a phone cannot *reach* them, which is the claim -- not merely that they are faint.
    await expect(page.getByRole("button", { name: "Invite a member" }), "both Invite triggers").toHaveCount(0);
    await expect(membersTable(page).getByRole("button", { name: `Actions for ${owner.name}` }), "the row menu").toHaveCount(0);
    await expect(invitesTable(page).getByRole("button", { name: "Resend" }), "Resend").toHaveCount(0);
    await expect(invitesTable(page).getByRole("button", { name: "Revoke" }), "Revoke").toHaveCount(0);

    // What the phone sheet does draw: the roster, the pending invite and the Roles table, all
    // readable. Team is not hidden on a phone -- only managed elsewhere.
    await expect(membersTable(page).getByRole("row").filter({ hasText: owner.email })).toContainText("Owner");
    await expect(invitesTable(page).getByRole("row").filter({ hasText: invited })).toContainText("Support");
    await expect(page.getByText("14 modules")).toBeVisible();
    await expect(page.getByText("Only Owners manage the team and provider keys.")).toBeVisible();

    expect(await layoutBreaks(page), "Team at 390px").toEqual([]);
    await expectAxeClean(page);

    // The control, and the thing that makes the four counts above mean "below sm" rather than
    // "gone": the same page at the desktop width the rest of this suite runs at. A gate that
    // swallowed the management surface everywhere would pass every assertion above.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByText("Open on a larger screen to manage the team.")).toBeHidden();
    await expect(page.getByRole("button", { name: "Invite a member" }).first()).toBeVisible();
    await expect(membersTable(page).getByRole("button", { name: `Actions for ${owner.name}` })).toBeVisible();
    await expect(invitesTable(page).getByRole("button", { name: "Resend" })).toBeVisible();
    await expect(invitesTable(page).getByRole("button", { name: "Revoke" })).toBeVisible();
  });

  /**
   * The Audit log (AuditLogPhone.dc.html), which is a different layout and not the table narrowed.
   *
   * This is the only place the claim can be made at all. Both layouts are in the tree at every
   * width and CSS picks one, so jsdom -- which has no CSS -- sees two of everything and can say
   * nothing about which a member reaches. `display: none` takes a subtree out of the accessibility
   * tree and out of the tab order together, so every `toHaveCount(0)` below means "a phone cannot
   * reach this", not "a phone cannot see it".
   *
   * Nothing here counts `console.audit_log`, so nothing here needs scoping to its own rows -- but
   * the page writes an "Opened the audit log" row per server render either way, which is why the
   * filter changes below go through the dialog rather than through a reload.
   */
  test("the Audit log at 390px draws cards, keeps every filter and loses only the export", async ({ page, baseURL }) => {
    await setUpFirstOwner(page, baseURL ?? BASE);

    await page.setViewportSize({ width: 390, height: 844 });
    // Twice, for the reason audit-log.spec.ts records: the page writes its own "Opened the audit
    // log" row in `after()`, once the response has already gone out, so the first paint need not
    // carry it. A reload is what makes a row certain -- and a reload is itself a legitimate open.
    await gotoReady(page, "/audit-log");
    await gotoReady(page, "/audit-log");
    await expect(page.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible();

    // AuditLogPhone.dc.html:64, in the place the sheet puts it -- and the control it replaces.
    // Export is the *only* thing this width loses.
    await expect(page.getByText("Open on a larger screen to export.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" }), "the export control").toHaveCount(0);

    // :101-113 -- a card per entry, and no table at all. The page has at least its own open by now.
    await expect(page.getByRole("table"), "the wide table").toHaveCount(0);
    const cards = page.getByRole("button", { name: /^Open the entry: / });
    await expect(cards.first()).toBeVisible();

    // :103-110 -- the whole card is the control, and it carries the four labelled cells under the
    // action.
    const first = cards.first();
    for (const label of ["Member", "Target", "Reason", "Address"]) await expect(first).toContainText(label);

    // :79-88 -- the four date tabs, and one icon button where the desktop draws four pickers. The
    // brief said a phone has no pickers; the sheet says they are one tap away.
    const group = page.getByRole("group", { name: "Date range" });
    await expect(group.getByRole("button")).toHaveText(["Today", "7 days", "30 days", "Custom"]);
    await expect(page.getByRole("combobox", { name: "Member" }), "the desktop pickers").toHaveCount(0);
    await expect(page.getByRole("searchbox", { name: "Search reasons and targets" }), "the desktop search box").toHaveCount(0);

    expect(await layoutBreaks(page), "the Audit log at 390px").toEqual([]);
    await expectAxeClean(page);

    // Every drawn control at 44px, which the sheet draws and only a real layout can measure.
    for (const name of ["Today", "Custom"]) {
      const box = await group.getByRole("button", { name }).boundingBox();
      expect(box?.height, `the ${name} tab`).toBeGreaterThanOrEqual(44);
    }
    const trigger = page.getByRole("button", { name: "Search and filters" });
    const triggerBox = await trigger.boundingBox();
    expect(triggerBox?.height, "the filters trigger").toBeGreaterThanOrEqual(44);
    expect(triggerBox?.width, "the filters trigger").toBeGreaterThanOrEqual(44);

    // The dialog the trigger promises, and the whole filter surface inside it.
    await trigger.click();
    const sheet = page.getByRole("dialog", { name: "Search and filters" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("searchbox", { name: "Search reasons and targets" })).toBeVisible();
    for (const name of ["Member", "Category", "Result", "Environment"]) {
      await expect(sheet.getByRole("combobox", { name }), name).toBeVisible();
    }
    expect(await layoutBreaks(page), "the filters dialog at 390px").toEqual([]);
    await expectAxeClean(page);

    // The Environment picker defaults to *this deployment's own*, so this is the page's own answer
    // to "where am I" rather than a hard-coded word -- asserted against a card once the dialog is
    // out of the way, because a modal takes the rest of the page out of the accessibility tree.
    const here = await sheet.getByRole("combobox", { name: "Environment" }).inputValue();
    expect(here, "the deployment's own environment").not.toBe("");

    // The same URL a wide screen writes: filters.ts is one model, so a view filtered on a phone is
    // still a link somebody can open on a laptop.
    await sheet.getByRole("combobox", { name: "Result" }).selectOption("done");
    await expect.poll(() => new URL(page.url()).searchParams.get("result")).toBe("done");
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toBeHidden();

    // Not drawn on either sheet, and non-negotiable all the same (task-2-addendum.md §4): every row
    // says which deployment wrote it. A log that showed a preview deployment's row as though it
    // were production's would lie, and that is the one thing this module must never do.
    await expect(cards.first(), "every card says which deployment wrote the row").toContainText(here);

    // :91-94 -- the chip *is* the remove control at 44px, and the desktop's "Filters" legend is not
    // drawn here. `Clear filters` is `btn-lg`.
    const chip = page.getByRole("button", { name: "Remove the filter Result: Done" });
    await expect(chip).toBeVisible();
    expect((await chip.boundingBox())?.height, "the filter chip").toBeGreaterThanOrEqual(44);
    // `toBeHidden`, not `toHaveCount(0)`: a text locator counts the DOM and knows nothing about
    // visibility, unlike the role locators above it -- which is the whole reason those are role
    // locators. The legend is a `span`, not a control, so it has no role to ask for.
    await expect(page.getByText("Filters", { exact: true }), "the wide bar's legend").toBeHidden();
    expect((await page.getByRole("button", { name: "Clear filters" }).boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(await layoutBreaks(page), "the Audit log filtered at 390px").toEqual([]);

    // :149-162 -- an entry opens full-bleed, not as the desktop's 480px drawer 12px clear of three
    // edges. Measured, because that is the whole difference between the two.
    await page.getByRole("button", { name: /^Open the entry: / }).first().click();
    const entry = page.getByRole("dialog", { name: "Audit entry" });
    await expect(entry).toBeVisible();
    await expect(entry.getByText("Entries can't be edited. They're deleted automatically after 2 years.")).toBeVisible();
    const entryBox = await entry.boundingBox();
    expect(entryBox?.x, "the entry sheet's left edge").toBe(0);
    expect(entryBox?.width, "the entry sheet's width").toBe(390);
    expect((await entry.getByRole("button", { name: "Close" }).boundingBox())?.height, "the entry's Close").toBeGreaterThanOrEqual(44);
    expect(await layoutBreaks(page), "the entry at 390px").toEqual([]);
    await expectAxeClean(page);
    await entry.getByRole("button", { name: "Close" }).click();
    await expect(entry).toBeHidden();

    // The control, and the thing that makes every count above mean "below sm" rather than "gone":
    // the same page at the width the rest of this suite runs at.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByText("Open on a larger screen to export.")).toBeHidden();
    await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Member" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Search and filters" })).toBeHidden();
    // The same entry, now as the desktop sheet's 480px drawer against the right edge.
    await page.getByRole("button", { name: /^Open the entry: / }).first().click();
    const wide = page.getByRole("dialog", { name: "Audit entry" });
    await expect(wide).toBeVisible();
    expect((await wide.boundingBox())?.width, "the drawer at 1280px").toBe(480);
  });
});
