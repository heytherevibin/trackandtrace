import { readFileSync } from "node:fs";
import { EXPORTED, auditRows, expectEntriesTotal, shot } from "./audit-helpers";
import { consoleSql, expect, resetConsole, setUpFirstOwner, test } from "./fixtures";
// TC-01 is one dialog wherever it is opened from, so its helper is shared rather than copied; it
// lives in team-helpers.ts because the Team page was the first module to need it.
import { tapThrough } from "./team-helpers";
import { AUDIT_SEARCH_MAX } from "@/console/audit/filters";
import { consoleMessages } from "@/console/messages";
import { TIME_ZONE } from "@/utils/datetime";
import { expectAxeClean, gotoReady } from "../helpers";

const BASE = "http://admin.localhost:4211";
const m = consoleMessages.audit;

test.beforeEach(() => resetConsole());

// The rest of module 14 -- the page, its filters, the drawer, the roster and the two no-access
// states -- is ./audit-log.spec.ts, and its docblock frames the module. This file is the export
// alone: it was lifted out when that one reached 493 lines against the 500-line cap
// tests/unit/tokens.contract.test.ts enforces over `src/` and `tests/`, and the seam is clean --
// the export is the only part of module 14 that downloads a file, spends a tap or needs a clock.

test.describe("the Audit log's export", () => {
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
      // Scoped to this owner, whose address is freshly minted per run (./audit-helpers.ts).
      const exportsByThisOwner = () => auditRows(owner.name, EXPORTED);

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
      await shot(page, "audit-export-ready-1280");
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
      await shot(page, "audit-export-ready-390");
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
  /**
   * The combined budget, end to end (branch review, Important 1).
   *
   * The canonical filter object is the `value` a tap is digested over, and every filter on this
   * page contributes to its length -- so one filter's room depends on all the others. Until the
   * bound was moved to the one place that binds, a search of 117 characters with default filters
   * (67 with a Member, a Category and a Result set) made the export impossible, and what TC-01
   * showed was zod's "Too big: expected string to have <=200 characters".
   *
   * This drives the worst case a member can actually produce: the longest search the box accepts,
   * with the three other pickers set, through the real dialog and a real tap. It is the case the
   * export e2e above never exercised, because it never searched before exporting.
   */
  test("exports with the longest search the box allows and every other filter set", async ({ page, baseURL }) => {
    const owner = await setUpFirstOwner(page, baseURL ?? BASE);
    await gotoReady(page, "/audit-log");

    // Every filter at once, the search at its own maximum. The set this describes is empty, which is
    // the point: what is being measured is whether the *ceremony* is reachable, not what comes back.
    await page.getByRole("combobox", { name: m.filters.member }).selectOption({ label: owner.name });
    await page.getByRole("combobox", { name: m.filters.category }).selectOption("provider_keys");
    await page.getByRole("combobox", { name: m.filters.result }).selectOption("refused");
    const box = page.getByRole("searchbox", { name: m.filters.search });
    await box.fill("q".repeat(AUDIT_SEARCH_MAX));
    await box.blur();
    // The box stops where parseAuditFilters stops, so this is genuinely the longest a member can ask
    // for rather than the longest this test felt like typing.
    await expect(box).toHaveValue("q".repeat(AUDIT_SEARCH_MAX));
    // Waited for, not assumed. The summary TC-01 draws is composed from the plate's own total, and
    // each filter re-reads through GET /api/audit -- so pressing Export the instant the last box is
    // filled asks about a set that has not been narrowed yet. Caught by this test failing with
    // "Export 129 audit entries from today" on a busy run, and green on a quiet one.
    await expectEntriesTotal(page, "today", 0);

    await page.getByRole("button", { name: m.export.action }).click();
    const tc01 = page.getByRole("dialog", { name: "Confirm it's you" });
    await expect(tc01).toBeVisible();
    await expect(tc01.getByText(/^Export 0 audit entries from today$/)).toBeVisible();
    await tapThrough(page, "Monthly access review for September.");

    // No zod string anywhere near the member, and a file at the end of it.
    const ready = page.getByRole("status").filter({ hasText: m.export.works });
    await expect(ready).toBeVisible();
    await expect(page.getByText(/Too big|expected string/i)).toHaveCount(0);

    const [download] = await Promise.all([page.waitForEvent("download"), ready.getByRole("button", { name: m.export.download }).click()]);
    const csv = readFileSync(await download.path(), "utf8");
    // A header and nothing under it: the filters matched no row, and that is a complete answer.
    expect(csv.replace(/^\uFEFF/, "").split("\r\n")).toHaveLength(1);
    await expect.poll(() => auditRows(owner.name, EXPORTED), { message: "and it is recorded like any other export" }).toBe(1);
  });

});
