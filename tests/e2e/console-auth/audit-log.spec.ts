import { consoleSql, expect, resetConsole, setUpFirstOwner, test } from "./fixtures";
import { consoleMessages } from "@/console/messages";
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
    await expect(table.getByRole("columnheader")).toHaveText(["Time ↓", "Environment", "Member", "Action", "Target", "Reason", "Result", "Address"]);

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
    // src/components/ui/data-table.tsx) and which layoutBreaks -- a *phone* layout tool -- reports as
    // a break on principle. The page-level check it makes is kept: `page scrolls sideways` is not
    // filtered out, so a table that escaped its own scroller would still be caught. Everything
    // outside the table -- the header, the filter bar, the chip row, the pager -- is held exactly.
    const breaks = (await layoutBreaks(page)).filter((line) => !/: (table|thead|tbody|tr|th|td)\b/.test(line) && !line.includes('div "Audit entries'));
    expect(breaks, "the Audit log at 1280px, outside the entries table's own scroller").toEqual([]);
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
