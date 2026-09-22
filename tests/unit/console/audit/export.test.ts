import { describe, expect, it } from "vitest";
import { auditCsv, exportAuditLog, type AuditEntry } from "@/console/audit/audit";
import {
  AUDIT_EXPORT_ACTION,
  AUDIT_EXPORT_MAX,
  AUDIT_SEARCH_MAX,
  auditExportFileName,
  auditExportFilters,
  auditExportRange,
  defaultAuditFilters,
  parseAuditFilters,
  type AuditFilters,
} from "@/console/audit/filters";
import type { ConsoleDb } from "@/console/auth/db";

// 19 September 2026, 13:30 IST -- the day AuditLog.dc.html's ready row is drawn on
// ("audit-2026-09-19.csv", :144), so the file name below is checked against the sheet rather than
// against itself.
const NOW = new Date("2026-09-19T08:00:00.000Z");
const BASE: AuditFilters = defaultAuditFilters("production");

// Two rows as console.audit_row really serialises them, taken from the pgTAP fixture rather than
// written fresh: `at` carries an OFFSET and drops its fractional part at zero microseconds, every
// null column is present and null, and one reason carries the comma, the double quote and the
// newline a CSV has to survive.
const FULL: AuditEntry = {
  id: "c7000000-0000-4000-8000-000000000008",
  at: "2019-03-17T12:15:00+00:00",
  environment: "production",
  actorId: "b0000000-0000-4000-8000-000000000002",
  actorName: "Rohan Iyer",
  actorRole: "admin",
  keyId: null,
  sessionLabel: "Safari on iPhone",
  category: "configure",
  action: "Changed a switch",
  target: "Site notice",
  reason: 'Announce the 21 Sep window, "quietly", and\nsay so twice.',
  result: "done",
  addressHash: "51cd…07aa",
  before: null,
  after: { site_notice: "on" },
};

const SYSTEM: AuditEntry = {
  id: "c7000000-0000-4000-8000-000000000001",
  at: "2019-03-17T02:00:00+00:00",
  environment: "production",
  actorId: null,
  actorName: "System",
  actorRole: null,
  keyId: null,
  sessionLabel: null,
  category: "system",
  action: "Purged unconfirmed sign-ups",
  target: "12 records",
  reason: "Retention rule: 7 days.",
  result: "done",
  addressHash: null,
  before: null,
  after: null,
};

function lines(csv: string): readonly string[] {
  return csv.replace(/^﻿/, "").split("\r\n");
}

describe("the canonical strings a tap is taken over", () => {
  // The whole point of the four digest fields: console.use_tap re-takes the digest from the
  // arguments console_audit_export was called with, so a tap minted for one export is spendable on
  // that export and on nothing else. These two strings carry every filter that changes which rows
  // leave the console.
  it("puts the half-open range in one string, start first", () => {
    expect(auditExportRange(BASE, NOW)).toBe("2026-09-18T18:30:00.000Z/2026-09-19T18:30:00.000Z");
  });

  it("puts the other five filters in one object, always the same keys in always the same order", () => {
    expect(auditExportFilters(BASE)).toBe('{"category":null,"environment":"production","member":null,"result":null,"search":null}');
    expect(auditExportFilters({ ...BASE, category: "team", result: "refused", search: "maintenance", member: "b0000000-0000-4000-8000-000000000002", environment: null })).toBe(
      '{"category":"team","environment":null,"member":"b0000000-0000-4000-8000-000000000002","result":"refused","search":"maintenance"}',
    );
  });

  // '' is never sent: p_category, p_result and p_environment are plain equalities in SQL, so an
  // empty string means *match nothing* and would hand a member an empty CSV with nothing to
  // explain it.
  it("sends null for an empty search, never an empty string", () => {
    expect(auditExportFilters({ ...BASE, search: "" })).toContain('"search":null');
  });

  // Change any filter and the string changes, so the digest changes, so the tap in hand is not
  // this export's tap. "today, refused only" and "two years, everything" can never share one.
  it("gives two different exports two different pairs of strings", () => {
    const narrow = { ...BASE, result: "refused" as const };
    const wide: AuditFilters = { ...BASE, range: "custom", from: "2024-09-19", to: "2026-09-19" };
    expect(auditExportFilters(narrow)).not.toBe(auditExportFilters(wide));
    expect(auditExportRange(wide, NOW)).not.toBe(auditExportRange(BASE, NOW));
  });


  // The search is the only free-text filter, so it is the only one that can make this string grow --
  // and it grows it into the export route's own FILTERS_MAX, where the failure lands *after* the
  // member has written a reason and tapped their key. The arithmetic is pinned rather than trusted.
  it("cannot be made to overflow the export route's own limit by anything a member can type", () => {
    const worst = auditExportFilters({
      ...BASE,
      search: "x".repeat(AUDIT_SEARCH_MAX),
      category: "c".repeat(40), // console.audit_log.category's own check constraint
      environment: "e".repeat(20), // and environment's
      member: "b0000000-0000-4000-8000-000000000002",
      result: "refused",
    });
    // FILTERS_MAX in src/app/console/api/audit/export/route.ts. Restated rather than imported,
    // because importing a route into a unit test drags next/headers in behind it.
    expect(worst.length).toBeLessThan(2_000);
  });

  // The other half of the same bound: an address nobody typed. parseAuditFilters refuses nothing --
  // a hand-edited query string falls back to the default view -- so an over-long search is dropped
  // exactly as an over-long category is, and never truncated into a search the member did not ask
  // for.
  it("drops a search longer than the box could have produced, rather than truncating it", () => {
    expect(parseAuditFilters({ q: "x".repeat(AUDIT_SEARCH_MAX) }, "production").search).toHaveLength(AUDIT_SEARCH_MAX);
    expect(parseAuditFilters({ q: "x".repeat(AUDIT_SEARCH_MAX + 1) }, "production").search).toBe("");
  });

  it("holds the same search bound the box holds", () => {
    expect(AUDIT_SEARCH_MAX).toBe(200);
  });

  it("names the action the database spends the tap under", () => {
    expect(AUDIT_EXPORT_ACTION).toBe("Exported the audit log");
  });
});

describe("the file name", () => {
  // AuditLog.dc.html:144 draws "audit-2026-09-19.csv" in the ready row, under the Today range, on
  // the 19th. It is a function of the range and not a constant.
  it("is the one IST day a single-day range covers", () => {
    expect(auditExportFileName(auditExportRange(BASE, NOW))).toBe("audit-2026-09-19.csv");
  });

  // The range's end is exclusive, so the last day it covers is the one before it -- a 7-day range
  // must not be named for the morning it stops at.
  it("names both ends of a longer range", () => {
    expect(auditExportFileName(auditExportRange({ ...BASE, range: "7d" }, NOW))).toBe("audit-2026-09-13-to-2026-09-19.csv");
  });

  it("says which end it has when only one was chosen", () => {
    expect(auditExportFileName("2026-09-18T18:30:00.000Z/")).toBe("audit-from-2026-09-19.csv");
    expect(auditExportFileName("/2026-09-19T18:30:00.000Z")).toBe("audit-to-2026-09-19.csv");
  });
});

describe("the CSV", () => {
  it("opens with a byte-order mark and the audit log's own column names", () => {
    const csv = auditCsv([FULL]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(lines(csv)[0]).toBe("id,at,environment,actor_id,actor_name,actor_role,key_id,session_label,category,action,target,reason,result,address_hash,before,after");
  });

  it("carries one line per row, in the order it was given them", () => {
    const rows = lines(auditCsv([FULL, SYSTEM]));
    expect(rows).toHaveLength(3);
    expect(rows[1]).toContain("c7000000-0000-4000-8000-000000000008");
    expect(rows[2]).toContain("c7000000-0000-4000-8000-000000000001");
  });

  // RFC 4180: a field carrying a quote, a comma or a line break is quoted, and a quote inside it is
  // doubled. The reason below carries all three at once, and it came out of the database that way.
  //
  // The break inside the field stays the \n the member typed and is NOT rewritten to the file's own
  // \r\n. A CSV record must come back as the row it was taken from; normalising it would make the
  // export the one place in the console where an audit reason is not what was stored.
  it("quotes a field with a comma, a quote or a newline in it, and doubles the quotes", () => {
    const csv = auditCsv([FULL]);
    expect(csv).toContain('"Announce the 21 Sep window, ""quietly"", and\nsay so twice."');
  });

  // console.write_audit stores SQL NULL for a reason that scrubbed away to nothing, and the System
  // row has no actor, no key, no session and no address at all. An empty field is the honest
  // rendering of that; the word "null" would be a value.
  it("leaves a null column empty rather than writing the word", () => {
    const row = lines(auditCsv([SYSTEM]))[1] ?? "";
    expect(row).toBe("c7000000-0000-4000-8000-000000000001,2019-03-17T02:00:00+00:00,production,,System,,,,system,Purged unconfirmed sign-ups,12 records,Retention rule: 7 days.,done,,,");
  });

  it("writes before and after as the JSON they are", () => {
    expect(auditCsv([FULL])).toContain('"{""site_notice"":""on""}"');
  });

  // `at` goes out exactly as the database serialised it -- offset and all. A second date
  // implementation here would be a second thing to keep in step with the table and the drawer, and
  // the offset form is unambiguous wherever the file is opened.
  it("passes the timestamp through untouched", () => {
    expect(auditCsv([FULL])).toContain("2019-03-17T12:15:00+00:00");
  });

  // A spreadsheet treats a cell beginning =, +, - or @ as a formula, and this file is opened in one
  // by the person reviewing it. Audit text is written by members and can name a lead's address or
  // anything else the console stored, so the leading character is defused. The apostrophe is
  // visible in the file, which is the honest trade: a record that is slightly annotated beats one
  // that runs.
  it("defuses a field a spreadsheet would run as a formula", () => {
    const csv = auditCsv([{ ...FULL, target: '=HYPERLINK("http://x","click")', reason: "@SUM(1)" }]);
    expect(csv).toContain(`'=HYPERLINK`);
    expect(csv).toContain("'@SUM(1)");
    // And only where it matters: an ordinary field is untouched.
    expect(csv).toContain("Changed a switch");
    expect(csv).not.toContain("'Changed a switch");
  });

  it("is a header and nothing else when the filtered set is empty", () => {
    expect(lines(auditCsv([]))).toHaveLength(1);
  });
});

describe("exportAuditLog", () => {
  function db(answer: { data?: unknown; error?: { message: string; code?: string } }): ConsoleDb {
    return { rpc: async () => ({ data: answer.data ?? null, error: answer.error ?? null }) } as unknown as ConsoleDb;
  }

  // `environment` is the deployment the row is written against, decided by the route and never by
  // a caller -- the same shape every other console writer takes (src/console/team/team.ts).
  const ask = { range: auditExportRange(BASE, NOW), filters: auditExportFilters(BASE), reason: "Monthly access review for September.", environment: "test" };

  it("hands the database the two canonical strings verbatim", async () => {
    const calls: unknown[] = [];
    const spy = {
      rpc: async (name: string, args: unknown) => {
        calls.push([name, args]);
        return { data: { rows: [], count: 0 }, error: null };
      },
    } as unknown as ConsoleDb;
    await exportAuditLog(ask, spy);
    expect(calls).toEqual([
      ["console_audit_export", { p_range: ask.range, p_filters: ask.filters, p_reason: ask.reason, p_environment: "test" }],
    ]);
  });

  it("answers with the CSV, the count and the name the file gets", async () => {
    const out = await exportAuditLog(ask, db({ data: { rows: [], count: 0 } }));
    expect(out.count).toBe(0);
    expect(out.fileName).toBe("audit-2026-09-19.csv");
    expect(lines(out.csv)).toHaveLength(1);
  });

  // Parsed, never cast: a row shape that drifted must read as "couldn't load" rather than reach a
  // CSV as whatever it happens to be.
  it("refuses a page whose shape drifted", async () => {
    await expect(exportAuditLog(ask, db({ data: { rows: [{ id: "not-a-uuid" }], count: 1 } }))).rejects.toThrow();
  });

  // A tap that no longer matches is not an outage and must not read as one -- the member's
  // confirmation went stale, and the recovery is to export again.
  it("translates a stale tap into its own line", async () => {
    await expect(exportAuditLog(ask, db({ error: { message: "no tap for this action", code: "42501" } }))).rejects.toThrow(/no longer matches this export/);
  });

  // The cap is a literal in console.audit_export_max() and AUDIT_EXPORT_MAX here; each comment
  // names the other, and this pins the one a member is shown.
  it("holds the same cap the database holds", () => {
    expect(AUDIT_EXPORT_MAX).toBe(10_000);
  });

  it("translates the cap into a line that says what to do", async () => {
    await expect(exportAuditLog(ask, db({ error: { message: "too many entries to export", code: "42501" } }))).rejects.toThrow(/narrow the range/i);
  });

  // Every other console refusal arrives as a bare 42501 -- a role that changed in another tab, a
  // hand-made request below the floor -- and none of them is a developer string a member may see.
  it("gives every other refusal the console's own words", async () => {
    await expect(exportAuditLog(ask, db({ error: { message: "no access", code: "42501" } }))).rejects.toThrow(/reload/i);
    await expect(exportAuditLog(ask, db({ error: { message: 'relation "console.audit_log" does not exist' } }))).rejects.toThrow(/could not be reached/i);
  });
});
