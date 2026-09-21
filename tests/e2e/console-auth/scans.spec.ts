import { expect, resetConsole, setUpFirstOwner, test } from "./fixtures";
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
    // The module rail is a moot check today (every module ships built: false, task-10-addendum.md
    // §1) -- neither ConsoleRail nor its phone trigger renders for any role, this Owner included, so
    // there is nothing to assert about the rail sheet here yet. What this page does draw at 390px --
    // the masthead, the three plates, the keys table stacked through table-stack -- is exactly what
    // layoutBreaks below covers.
    expect(await layoutBreaks(page), "My keys at 390px").toEqual([]);
    await expectAxeClean(page);

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
});
