import { readFileSync } from "node:fs";
import { consoleSql, expect, resetConsole, setUpFirstOwner, test } from "./fixtures";
// TC-01 is one dialog wherever it is opened from, so its helper is shared rather than copied. It
// lives in team-helpers.ts because the Team page was the first module to need it.
import { tapThrough } from "./team-helpers";
import { consoleMessages } from "@/console/messages";
import { TIME_ZONE } from "@/utils/datetime";
import { expectAxeClean, gotoReady } from "../helpers";
import { layoutBreaks } from "../layout";

const BASE = "http://admin.localhost:4211";
const m = consoleMessages.audit;

test.beforeEach(() => resetConsole());

/**
 * The Audit log (AuditLog.dc.html), in a real Chromium against a real local Supabase stack. Three
 * things only this run can show, and the first two are the whole point of the module:
 *
 * 1. **The read is audited, and the page proves it about itself.** The row the page writes when it
 *    is opened -- "Opened the audit log" / "Audit log" -- is one of the rows it then shows. A unit
 *    test can assert that `writeConsoleAudit` was called; only this can show the row coming back out
 *    of `console_audit` through the real function, the real zod and the real table.
 * 2. **Filtering and paging never write another one.** Ruling (task-2-addendum.md §5): one row per
 *    server render, none from the GET route the client re-reads. So a filter change must leave the
 *    count of "Opened the audit log" rows exactly where it was -- and the filtered view's address
 *    must still be linkable, which is the other half of the same design.
 * 3. The layout holds and axe is clean at the sheet's own 1280 width, which jsdom cannot say
 *    anything about (console-rail.test.tsx's own note on the reverse case).
 */
test.describe("the Audit log", () => {
  test("shows its own open, and neither filtering nor paging records another", async ({ page, baseURL }) => {
    const owner = await setUpFirstOwner(page, baseURL ?? BASE);

    // Scoped to the rows this test wrote, and nothing else. `resetConsole()` deletes members,
    // sessions and keys; it deliberately leaves the audit log alone, because the log holds no
    // foreign keys and outliving its subjects is the whole point of it (fixtures.ts's own note). So
    // every earlier run's rows -- including the Refused one the second test below writes -- are
    // still in this table, and a bare count of "Opened the audit log" would be counting them too.
    // `actor_name` is the log's own denormalised copy of the member's name, and this owner's
    // address is freshly minted per run, so it names exactly the rows this test is responsible for.
    const opensByThisOwner = () =>
      Number(consoleSql(`select count(*) from console.audit_log where action = 'Opened the audit log' and actor_name = '${owner.name}'`));

    /**
     * The count once it has stopped moving. `after()` writes the page's own row *after* the response
     * has already gone out, so a count taken the moment a row appears can still grow by one while
     * the next assertion runs -- which is exactly how the first version of this test failed, as
     * before+1. Polling for a single value would only move the race; polling for two consecutive
     * reads that agree is what actually waits for the write to land.
     */
    const settledOpens = async (): Promise<number> => {
      let previous = -1;
      await expect
        .poll(() => {
          const now = opensByThisOwner();
          const settled = now > 0 && now === previous;
          previous = now;
          return settled;
        })
        .toBe(true);
      return previous;
    };

    await gotoReady(page, "/audit-log");
    await expect(page.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible();
    await expect(page.getByText("Every action taken in the console: who took it, when and why.")).toBeVisible();

    // The sheet's own columns in the sheet's own relative order (AuditLog.dc.html:160), with the
    // Environment column the environment ruling added (task-2-addendum.md §4) second -- where it is
    // always readable rather than the first thing to scroll out of a wide table.
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    // "Open" last, in a visually-hidden span: the header is there for a screen reader and not on
    // screen, because every cell under it says the same word (:160).
    await expect(table.getByRole("columnheader")).toHaveText(["Time ↓", "Environment", "Member", "Action", "Target", "Reason", "Result", "Address", "Open"]);

    // The page's own row, read back out through console_audit, the real zod and the real table.
    // `after()` writes it once the response has gone out, so the first paint may not carry it -- a
    // reload is what makes it certain, and a reload is itself a legitimate second open.
    await gotoReady(page, "/audit-log");
    const mine = page.getByRole("row", { name: new RegExp(`Opened the audit log.*${owner.name}|${owner.name}.*Opened the audit log`) });
    await expect(mine.first()).toBeVisible();
    await expect(mine.first()).toContainText("Audit log");
    await expect(mine.first()).toContainText("Owner");
    const before = await settledOpens();

    // A filter change re-reads from GET /api/audit and writes nothing. The address follows it
    // (history.replaceState) so the filtered view stays linkable without a server render.
    await page.getByRole("button", { name: "7 days" }).click();
    await expect(page.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => new URL(page.url()).searchParams.get("range")).toBe("7d");
    await page.getByRole("combobox", { name: "Result" }).selectOption("done");
    await expect.poll(() => new URL(page.url()).searchParams.get("result")).toBe("done");
    await expect(page.getByText("Filters", { exact: true })).toBeVisible();
    await expect(page.getByText("Result: Done")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();

    // Ruling (task-2-addendum.md §5), in the only place it can actually be shown: two client
    // re-reads happened and the log did not grow by one row.
    expect(opensByThisOwner(), "a filter change must not record an open").toBe(before);

    // Everything except the entries table's own sideways scroll, which is what DataTable is built to
    // do with a wide table ("Scrolls sideways on wide screens; stacks into labelled rows below md",
    // src/components/ui/data-table.tsx) and which layoutBreaks -- a *phone* layout tool reading
    // getBoundingClientRect, which knows nothing about clipping -- reports as a break on principle.
    //
    // The table is hidden for the measurement rather than filtered out of it by element name. The
    // name filter this replaces (`td|th|tr|...`) let a `span "Done"` through the moment Task 3's
    // ninth column pushed a Badge past 1280, which is a false alarm about a cell that is merely
    // scrolled out of view -- and the next such cell would have been a different tag again.
    const entries = page.locator('[role="region"][aria-label^="Audit entries"]');
    await entries.evaluate((el: HTMLElement) => (el.style.display = "none"));
    const breaks = await layoutBreaks(page);
    await entries.evaluate((el: HTMLElement) => (el.style.display = ""));
    expect(breaks, "the Audit log at 1280px, outside the entries table's own scroller").toEqual([]);

    // And with the table back, what a member would actually feel: the page does not scroll
    // sideways. Measured rather than inferred, because `documentElement.scrollWidth` cannot be
    // trusted here -- Chrome folds a nested scroller's overflow into every ancestor's scrollWidth
    // (1412px in a 1280px viewport on this page) while still clipping it and refusing to scroll.
    // `window.scrollX` is the property that does not lie.
    const scrolledBy = await page.evaluate(() => {
      window.scrollTo(3000, 0);
      const x = window.scrollX;
      window.scrollTo(0, 0);
      return x;
    });
    expect(scrolledBy, "the Audit log must not scroll sideways at 1280px").toBe(0);
    await expectAxeClean(page);

    // Clear filters takes the address back to the page's own, which is what "the default view
    // writes nothing at all" means once it is a real browser URL.
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect.poll(() => new URL(page.url()).search).toBe("");
    expect(opensByThisOwner(), "clearing the filters must not record an open either").toBe(before);
  });

  /**
   * Why no link to this page may ever set `prefetch` -- measured against the running server rather
   * than reasoned about, because the reasoning went the wrong way round once already.
   *
   * The automatic path cannot be exercised here at all:
   * `next/dist/client/components/links.js:217-223` disables viewport prefetching outright when
   * `NODE_ENV !== 'production'`, and this suite runs `next dev`. So both requests below are made by
   * hand, in the two shapes Next's own fetch strategies send
   * (`segment-cache/cache.js:1195` vs `:1954-1958`), through `page.request`, which carries the
   * browser context's cookies -- so each one is the signed-in member's own.
   *
   * What they establish:
   *
   * 1. A request carrying `Next-Router-Prefetch: 1` (the PPR strategy, which is what a `<Link>` with
   *    no `prefetch` prop uses) is answered from the route shell and **never renders this page**. No
   *    row, and the page's own header check never even runs -- it is belt-and-braces, not the thing
   *    keeping the log clean. This test passes with that check deleted, which is exactly why it is
   *    written as a statement about Next rather than about the guard.
   * 2. The same request **without** that header -- the shape `FetchStrategy.Full` sends, which is
   *    what `<Link prefetch>` selects -- renders the page in full and **does** write a row. That is
   *    the hazard in one assertion: add `prefetch` to a link pointing here and every viewport
   *    impression of it records an open that never happened, into a table nothing can delete from.
   *
   * The rule that actually prevents it is "no console link sets `prefetch`", held by
   * tests/unit/console/audit/prefetch-guard.test.tsx. This test is what tells us the day Next
   * changes either half of the measurement underneath that rule.
   */
  test("a prefetch never renders the page; the same request without the header does, and is recorded", async ({ page, baseURL }) => {
    const owner = await setUpFirstOwner(page, baseURL ?? BASE);
    const opens = () => Number(consoleSql(`select count(*) from console.audit_log where action = 'Opened the audit log' and actor_name = '${owner.name}'`));
    const url = `${baseURL ?? BASE}/audit-log`;

    await gotoReady(page, url);
    // Settled, not merely non-zero: `after()` writes the row once the response has already gone out.
    let before = -1;
    await expect
      .poll(() => {
        const now = opens();
        const settled = now > 0 && now === before;
        before = now;
        return settled;
      })
      .toBe(true);

    for (let attempt = 0; attempt < 3; attempt++) {
      const prefetch = await page.request.get(url, { headers: { RSC: "1", "Next-Router-Prefetch": "1" } });
      expect(prefetch.ok(), "a prefetch is still served, just not rendered").toBe(true);
      // The shell, not the page: none of what this page draws is in it.
      const body = await prefetch.text();
      expect(body, "a prefetch must not carry the page's own content").not.toContain(m.entries.title);
      expect(body.length, "the shell is a fraction of the rendered page").toBeLessThan(2000);
    }
    // The same chance to land that the real render's own `after()` got above.
    await page.waitForTimeout(1000);
    expect(opens(), "three prefetches must record nothing").toBe(before);

    // The hazard, pinned: no prefetch header, a full render, a row. This is what a `<Link prefetch>`
    // to this page would do on every viewport impression.
    const full = await page.request.get(url, { headers: { RSC: "1" } });
    expect(full.ok()).toBe(true);
    expect(await full.text(), "a full-payload fetch does render the page").toContain(m.entries.title);
    await expect.poll(opens, { message: "a full-payload fetch is indistinguishable from an open, and is recorded as one" }).toBe(before + 1);
  });

  /**
   * The drawer (Task 3), on a row the console really wrote. Two things only this run can show:
   *
   * 1. **The key's name comes from a LEFT join on `console.keys`, at read time.** The "Added a key"
   *    row the first-Owner setup writes carries a real `key_id`; the drawer resolves it to the name
   *    that ceremony was given. Then the key is removed -- an ordinary thing an Owner does -- and
   *    the same row, which nothing may rewrite, says the key is gone rather than pretending the
   *    action was taken without one (task-3-addendum.md §2).
   * 2. **Opening an entry records nothing.** One row per server render of the page, and none from
   *    the GET route -- opening a drawer is not opening the log.
   */
  test("opens one entry in full, and names the key that was tapped until it is gone", async ({ page, baseURL }) => {
    const owner = await setUpFirstOwner(page, baseURL ?? BASE);

    // Scoped to this owner's own rows. console.audit_log survives resetConsole() by design, so a
    // bare count would be counting every earlier run on this machine as well -- the trap this
    // branch has now fallen into four times, most recently in Task 2's own e2e.
    const mine = () => Number(consoleSql(`select count(*) from console.audit_log where actor_name = '${owner.name}'`));
    const settled = async (): Promise<number> => {
      let previous = -1;
      await expect
        .poll(() => {
          const now = mine();
          const stopped = now > 0 && now === previous;
          previous = now;
          return stopped;
        })
        .toBe(true);
      return previous;
    };

    await gotoReady(page, "/audit-log");
    const before = await settled();

    // The setup journey writes two "Added a key" rows; this is the first key's. Scoped to this
    // owner, for the same reason the count above is: the log survives resetConsole(), so every
    // earlier run's "Added a key / YubiKey 5C" row is still in this table -- twelve of them, the
    // first time this was written without the owner's name in the filter.
    const row = page.getByRole("row").filter({ hasText: owner.name }).filter({ hasText: "Added a key" }).filter({ hasText: "YubiKey 5C" });
    await expect(row).toHaveCount(1);
    const openControl = row.getByRole("button", { name: /^Open the entry: Added a key at \d\d:\d\d IST$/ });
    await openControl.click();

    const drawer = page.getByRole("dialog", { name: m.entry.title });
    await expect(drawer).toBeVisible();
    // The sheet's nine labels and Environment second (AuditLog.dc.html:229-238).
    await expect(drawer.locator("dt")).toHaveText([
      m.entry.labels.time,
      m.entry.labels.environment,
      m.entry.labels.member,
      m.entry.labels.action,
      m.entry.labels.target,
      m.entry.labels.reason,
      m.entry.labels.result,
      m.entry.labels.address,
      m.entry.labels.session,
      m.entry.labels.change,
    ]);
    await expect(drawer.getByText(m.entry.retention)).toBeVisible();
    // The key the ceremony really recorded, through the join rather than through anything the
    // table handed over -- no row the list returns carries a key name at all.
    await expect(drawer.getByText(`${owner.name} · Owner · ${m.entry.keyNamed("YubiKey 5C")}`)).toBeVisible();
    // "Added a key" writes an `after` and no `before`: one of the three shapes the sheet composes.
    await expect(drawer.locator("dt", { hasText: m.entry.labels.change }).locator("+ dd")).toHaveText(/^type: none → “(security_key|passkey)”\.$/);
    await expectAxeClean(page);

    expect(mine(), "opening an entry must not record anything").toBe(before);

    // The key goes. The entry does not, and cannot: the log holds no foreign key and nothing may
    // rewrite a row in it. `console.sessions.key_id` is `on delete set null` and the session's
    // `key_verified_at` stands, so the member stays signed in throughout.
    await drawer.getByRole("button", { name: "Close" }).click();
    await expect(drawer).toHaveCount(0);
    consoleSql(`delete from console.keys where name = 'YubiKey 5C' and member_id = (select user_id from console.members where email = '${owner.email}')`);

    await openControl.click();
    await expect(drawer.getByText(`${owner.name} · Owner · ${m.entry.keyGone}`)).toBeVisible();
    await expect(drawer.getByText("YubiKey 5C")).toHaveCount(1); // the target, and no longer the key clause
    expect(mine(), "and neither must re-opening it").toBe(before);
  });


  /**
   * The export (Task 4), end to end: a real tap against a real virtual key, a real
   * `console_audit_export` spending that tap and writing its own row in one transaction, a real CSV
   * out of the real table, and a real download in Chromium.
   *
   * Four things only this run can show, and every one of them is a seam a unit test has to fake:
   *
   * 1. **The tap the browser mints and the tap the database spends are the same tap.** The two
   *    canonical strings are digested by `console.action_digest` at mint and re-digested by
   *    `console.use_tap` at spend, over bytes that crossed two processes in between. Nothing below
   *    stubs either end. If `auditExportRange` and the function's own parse ever disagreed about a
   *    single character, this is where it would show -- as the refusal a member would get.
   * 2. **The file really arrives.** The prepared export is a Blob in the page and nothing else --
   *    no store, no token, no download URL -- so "it downloads" is a claim about an object URL and
   *    an anchor that only a browser can settle.
   * 3. **The CSV carries the table.** Its rows are the ones this console actually wrote, through
   *    `console.audit_row`, the real zod and the real serialiser.
   * 4. **Works once.** The ready row goes when the file is handed over, and the next export needs
   *    another ceremony.
   */
  test("exports the log after a real tap, hands over the file once, and records that it did", async ({ page, baseURL }) => {
    const owner = await setUpFirstOwner(page, baseURL ?? BASE);
    // Scoped to this owner, whose address is freshly minted per run: console.audit_log survives
    // resetConsole() by design, so a bare count would be counting every earlier run's exports too.
    const exportsByThisOwner = () =>
      Number(consoleSql(`select count(*) from console.audit_log where action = 'Exported the audit log' and actor_name = '${owner.name}'`));

    await gotoReady(page, "/audit-log");
    await expect(page.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible();
    expect(exportsByThisOwner(), "nothing has been exported yet").toBe(0);

    // AuditLog.dc.html:90 draws the control in the page header, and :237 draws the confirm step as
    // TC-01 with a summary composed from the count and the range.
    await page.getByRole("button", { name: m.export.action }).click();
    const tc01 = page.getByRole("dialog", { name: "Confirm it's you" });
    await expect(tc01).toBeVisible();
    await expect(tc01.getByText(/^Export \d+ audit entr(y|ies) from today$/)).toBeVisible();
    // The Change line is drawn for actions that have a before and an after. An export has neither.
    await expect(tc01.getByText("Change", { exact: true })).toHaveCount(0);
    await expectAxeClean(page);

    await tapThrough(page, "Monthly access review for September.");

    // :142-147: the file name, the sheet's own line about it, and Download -- on the board, not in
    // the dialog, which the completed tap closed.
    const ready = page.getByRole("status").filter({ hasText: m.export.works });
    await expect(ready).toBeVisible();
    // The name is a function of the range, and the range is today in IST -- the console's one clock.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    await expect(ready.getByText(`audit-${today}.csv`)).toBeVisible();
    await expectAxeClean(page);

    /**
     * **The Ready row is the one export control a phone may reach, and that is deliberate.**
     *
     * Task 5 hides every other one below sm, because AuditLogPhone.dc.html draws none of them and
     * replaces them with a single line (:64). This row is the exception: it can only exist because
     * an export was started on a wide screen, and the only way to see it at 390px is to narrow that
     * screen afterwards -- a rotate, or a window dragged in. Hiding it there would take away a
     * single-use export that has **already spent a tap and already written its own audit row**,
     * leaving a permanent record, in a table with no update and no delete, of an export nobody
     * received. That is the harm this whole state was built to avoid.
     *
     * Pinned here rather than in the 390px scan because the ceremony already ran: the scan's own
     * note is that a scan which spends a minute on WebAuthn is a scan people stop running. This
     * costs two resizes on an export that is already prepared.
     */
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(ready, "a prepared export must survive a narrow to a phone").toBeVisible();
    await expect(ready.getByRole("button", { name: m.export.download })).toBeVisible();
    // And the asymmetry, in the same breath: what a phone may not do is *start* one.
    await expect(page.getByRole("button", { name: m.export.action }), "the control that starts an export").toHaveCount(0);
    await expect(page.getByText(m.exportOnLargerScreen)).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(ready).toBeVisible();

    const [download] = await Promise.all([page.waitForEvent("download"), ready.getByRole("button", { name: m.export.download }).click()]);
    expect(download.suggestedFilename()).toBe(`audit-${today}.csv`);
    const saved = await download.path();
    const csv = readFileSync(saved, "utf8");

    // The byte-order mark is not decoration: without it Excel reads the file as the local code page
    // and every curly quote and Indian name in the console arrives as mojibake.
    expect(csv.startsWith("﻿"), "a UTF-8 byte-order mark").toBe(true);
    expect(csv.replace(/^﻿/, "").split("\r\n")[0]).toBe(
      "id,at,environment,actor_id,actor_name,actor_role,key_id,session_label,category,action,target,reason,result,address_hash,before,after",
    );
    // The rows are this console's own, written by the real writer and read back through the real
    // function: the open this very page recorded a moment ago, and the keys the owner added.
    expect(csv, "the page's own open is in its own export").toContain("Opened the audit log");
    expect(csv).toContain(owner.name);
    expect(csv).toContain("Added a key");

    await expect.poll(exportsByThisOwner, { message: "an export is an audited action and records itself" }).toBe(1);
    // Written inside the same transaction as the tap, with what left and under what -- so a later
    // reader can tell a one-day review from a two-year sweep.
    const recorded = consoleSql(
      `select after ->> 'count' from console.audit_log where action = 'Exported the audit log' and actor_name = '${owner.name}'`,
    ).trim();
    expect(Number(recorded), "the row says how many entries left the console").toBeGreaterThan(0);

    // "Works once": the file is handed over and let go in the same press, and the next export is a
    // new ceremony rather than a second download of the old one.
    await expect(ready).toHaveCount(0);
    await page.getByRole("button", { name: m.export.action }).click();
    await expect(page.getByRole("dialog", { name: "Confirm it's you" })).toBeVisible();
  });

  // The other half of the sheet's own no-access row: a Viewer opening module 14 gets the state, not
  // a redirect, and the attempt is recorded as Refused (AuditLog.dc.html:312, task-2-addendum.md §5).
  test("gives a Viewer the sheet's no-access state rather than the log", async ({ page, baseURL }) => {
    const owner = await setUpFirstOwner(page, baseURL ?? BASE);
    // Demoted directly: this is about what the page does with a role, not about how the role got
    // there, and console_change_role needs a second Owner and a tap to get there through the UI.
    consoleSql(`update console.members set role = 'viewer' where email = '${owner.email}'`);

    await gotoReady(page, "/audit-log");
    await expect(page.getByText("This module isn't part of the Viewer role.")).toBeVisible();
    await expect(page.getByText("Ask an Owner if you need it.")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
    await expectAxeClean(page);
  });
});
