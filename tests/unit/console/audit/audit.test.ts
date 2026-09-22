import { describe, expect, it, vi } from "vitest";
import { getAuditEntry, getAuditLog, parseAuditEntry, parseAuditPage, type AuditQuery } from "@/console/audit/audit";
import type { ConsoleDb } from "@/console/auth/db";

// The two shapes console_audit actually returns, copied from task-1-report.md's own captured output
// rather than written by hand. Both awkward forms are here on purpose (task-2-addendum.md §2):
//
//  - FULL carries a fractional timestamp with an OFFSET, never a "Z". Every fixture in the watchlist
//    wrote "Z" and that is the gap that shipped a production bug.
//  - SYSTEM is the row console.purge_audit and its kin write: `at` with no fractional part at all
//    (Postgres drops it at zero microseconds), a `category` of 'system' -- outside the six names in
//    src/console/auth/audit.ts:12, which is why the shape below must not be an enum -- and every
//    nullable column present and null.
const FULL = {
  at: "2019-03-14T14:02:31.256374+00:00",
  id: "5a000000-0000-4000-8000-000000000013",
  after: { pnr_checks: "paused" },
  action: "Paused PNR checks",
  before: { pnr_checks: "on" },
  key_id: "f0000000-0000-4000-8000-00000000000f",
  reason: "Provider maintenance window, 14:00-15:00 IST.",
  result: "done",
  target: "PNR checks",
  actor_id: "a0000000-0000-4000-8000-000000000001",
  category: "configure",
  actor_name: "Asha Rao",
  actor_role: "owner",
  environment: "production",
  address_hash: "a3f9...c2c1",
  session_label: "Chrome on macOS",
};

const SYSTEM = {
  at: "2019-03-14T02:00:00+00:00",
  id: "5a000000-0000-4000-8000-000000000001",
  after: null,
  action: "Purged unconfirmed sign-ups",
  before: null,
  key_id: null,
  reason: null,
  result: "done",
  target: "12 records",
  actor_id: null,
  category: "system",
  actor_name: "System",
  actor_role: null,
  environment: "production",
  address_hash: null,
  session_label: null,
};

const PAGE = { rows: [FULL, SYSTEM], total: 2 };

function dbAnswering(result: { data?: unknown; error?: { message: string; code?: string } }): { readonly db: ConsoleDb; readonly rpc: ReturnType<typeof vi.fn> } {
  const rpc = vi.fn(() => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }));
  return { db: { rpc } as unknown as ConsoleDb, rpc };
}

const EVERY_FILTER: AuditQuery = {
  from: "2026-09-22T00:00:00.000Z",
  to: "2026-09-23T00:00:00.000Z",
  member: "a0000000-0000-4000-8000-000000000001",
  category: "configure",
  result: "done",
  search: "maintenance",
  environment: "production",
  limit: 50,
  offset: 0,
};

const NO_FILTER: AuditQuery = { from: null, to: null, member: null, category: null, result: null, search: null, environment: null, limit: 50, offset: 0 };

describe("parseAuditPage", () => {
  it("camelCases all sixteen keys of a full row", () => {
    expect(parseAuditPage({ rows: [FULL], total: 1 })).toEqual({
      total: 1,
      rows: [
        {
          id: "5a000000-0000-4000-8000-000000000013",
          at: "2019-03-14T14:02:31.256374+00:00",
          environment: "production",
          actorId: "a0000000-0000-4000-8000-000000000001",
          actorName: "Asha Rao",
          actorRole: "owner",
          keyId: "f0000000-0000-4000-8000-00000000000f",
          sessionLabel: "Chrome on macOS",
          category: "configure",
          action: "Paused PNR checks",
          target: "PNR checks",
          reason: "Provider maintenance window, 14:00-15:00 IST.",
          result: "done",
          addressHash: "a3f9...c2c1",
          before: { pnr_checks: "on" },
          after: { pnr_checks: "paused" },
        },
      ],
    });
  });

  // The System row: a timestamp with no fractional part, a category outside the six TypeScript
  // names, and every nullable column null. An enum on `category` would fail closed on a real row.
  it("takes the System row: no fractional seconds, a free-text category, nulls throughout", () => {
    const parsed = parseAuditPage({ rows: [SYSTEM], total: 1 });
    expect(parsed.rows[0]).toMatchObject({
      at: "2019-03-14T02:00:00+00:00",
      category: "system",
      actorId: null,
      actorRole: null,
      keyId: null,
      sessionLabel: null,
      reason: null,
      addressHash: null,
      before: null,
      after: null,
    });
  });

  it("takes an empty page as the real empty array the function promises", () => {
    expect(parseAuditPage({ rows: [], total: 0 })).toEqual({ rows: [], total: 0 });
  });

  // `z.iso.datetime({ offset: true })` is what the shape must use, and this is what it buys: the
  // default `z.iso.datetime()` accepts only the "Z" form and would refuse every row the database
  // actually writes. It accepts the "Z" form too -- deliberately, since the addendum's rule is
  // "covers both" -- so the boundary worth pinning is a timestamp carrying no zone at all.
  it("takes the offset form the database writes, which a Z-only shape would have refused", () => {
    expect(parseAuditPage({ rows: [FULL], total: 1 }).rows[0]?.at).toBe("2019-03-14T14:02:31.256374+00:00");
    expect(() => parseAuditPage({ rows: [{ ...FULL, at: "2019-03-14T14:02:31" }], total: 1 })).toThrow();
    expect(() => parseAuditPage({ rows: [{ ...FULL, at: "2019-03-14" }], total: 1 })).toThrow();
  });

  // `.nullable()`, never `.optional()` (task-2-addendum.md §2): jsonb_build_object keeps the key and
  // nothing in this path strips nulls, so a missing key is not a null column -- it is drift.
  it("refuses a row whose null column arrived missing rather than null", () => {
    const withoutReason: Record<string, unknown> = { ...FULL };
    delete withoutReason.reason;
    expect(() => parseAuditPage({ rows: [withoutReason], total: 1 })).toThrow();
  });

  it("refuses a result outside the closed set, which the database compares as text and never checks", () => {
    expect(() => parseAuditPage({ rows: [{ ...FULL, result: "nonsense" }], total: 1 })).toThrow();
  });

  it("refuses a page whose rows arrived as null rather than an array", () => {
    expect(() => parseAuditPage({ rows: null, total: 0 })).toThrow();
  });

  it("refuses a total that is not a number", () => {
    expect(() => parseAuditPage({ rows: [], total: "0" })).toThrow();
  });
});

describe("getAuditLog", () => {
  it("returns the parsed page console_audit reports", async () => {
    const { db } = dbAnswering({ data: PAGE });
    const page = await getAuditLog(EVERY_FILTER, db);
    expect(page.total).toBe(2);
    expect(page.rows.map((r) => r.action)).toEqual(["Paused PNR checks", "Purged unconfirmed sign-ups"]);
  });

  it("sends every filter under the name console_audit gave it", async () => {
    const { db, rpc } = dbAnswering({ data: PAGE });
    await getAuditLog(EVERY_FILTER, db);
    expect(rpc).toHaveBeenCalledWith("console_audit", {
      p_from: "2026-09-22T00:00:00.000Z",
      p_to: "2026-09-23T00:00:00.000Z",
      p_member: "a0000000-0000-4000-8000-000000000001",
      p_category: "configure",
      p_result: "done",
      p_search: "maintenance",
      p_environment: "production",
      p_limit: 50,
      p_offset: 0,
    });
  });

  // task-2-addendum.md §3: p_category, p_result and p_environment are plain equalities, so '' means
  // "match nothing" and a filter sent as an empty string silently shows an empty log. An absent
  // filter leaves the argument out entirely, which is the function's own `default null`.
  it("never sends an empty string for an absent filter", async () => {
    const { db, rpc } = dbAnswering({ data: { rows: [], total: 0 } });
    await getAuditLog(NO_FILTER, db);
    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    for (const [key, value] of Object.entries(args)) expect(value, key).not.toBe("");
    for (const key of ["p_from", "p_to", "p_member", "p_category", "p_result", "p_search", "p_environment"]) {
      expect(args[key] ?? null, key).toBeNull();
    }
    expect(args.p_limit).toBe(50);
  });

  it("fails closed on a shape console_audit never produces, rather than handing the page a half-row", async () => {
    const { db } = dbAnswering({ data: { rows: [{ ...FULL, at: "yesterday" }], total: 1 } });
    await expect(getAuditLog(EVERY_FILTER, db)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });

  it("answers a database refusal with the console's own no-access line, never Postgres's", async () => {
    const { db } = dbAnswering({ error: { message: "no access", code: "42501" } });
    await expect(getAuditLog(EVERY_FILTER, db)).rejects.toMatchObject({ code: "INVALID_INPUT", message: "You don't have access to this." });
  });

  it("answers any other database error with the console's own unavailable line", async () => {
    const { db } = dbAnswering({ error: { message: 'relation "console.audit_log" does not exist', code: "42P01" } });
    await expect(getAuditLog(EVERY_FILTER, db)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });
});

// One entry: a list row's sixteen keys plus `key_name`, resolved through a LEFT join on
// console.keys that lives on this function alone (task-3-addendum.md §2). Both awkward timestamp
// forms are carried again here rather than assumed from the page's fixtures -- the entry is a
// different function and could drift on its own.
const ENTRY = { ...FULL, key_name: "YubiKey 5C" };
// The same entry after the key was removed or reset away. Not an edge case: this is the normal
// state of an old row, because the log holds no foreign key and is never rewritten when a key goes.
const ENTRY_KEY_GONE = { ...FULL, key_name: null };
// The System row, whole-second `at` and all: no actor, no key, and therefore no key name either.
const ENTRY_SYSTEM = { ...SYSTEM, key_name: null };

describe("parseAuditEntry", () => {
  it("camelCases the sixteen keys and the key name beside them", () => {
    expect(parseAuditEntry(ENTRY)).toMatchObject({
      id: "5a000000-0000-4000-8000-000000000013",
      at: "2019-03-14T14:02:31.256374+00:00",
      environment: "production",
      keyId: "f0000000-0000-4000-8000-00000000000f",
      keyName: "YubiKey 5C",
      sessionLabel: "Chrome on macOS",
      before: { pnr_checks: "on" },
      after: { pnr_checks: "paused" },
    });
  });

  // console_audit_entry answers SQL NULL for an id that is not there -- not an error, not a
  // refusal (task-3-addendum.md §3). `null` is therefore data, and must never read as drift.
  it("takes a SQL NULL as 'no such entry' rather than as a shape that failed to parse", () => {
    expect(parseAuditEntry(null)).toBeNull();
  });

  it("takes a key that no longer resolves: the entry still happened, the name is simply gone", () => {
    expect(parseAuditEntry(ENTRY_KEY_GONE)).toMatchObject({ keyId: "f0000000-0000-4000-8000-00000000000f", keyName: null });
  });

  it("takes the System row: a whole-second timestamp, no key id and no key name", () => {
    expect(parseAuditEntry(ENTRY_SYSTEM)).toMatchObject({ at: "2019-03-14T02:00:00+00:00", keyId: null, keyName: null, actorRole: null });
  });

  // `.nullable()`, never `.optional()`: jsonb_build_object keeps the key, so a missing key_name is
  // drift -- an older console_audit_entry that never learned to join -- and not a key that is gone.
  it("refuses an entry whose key_name arrived missing rather than null", () => {
    expect(() => parseAuditEntry(FULL)).toThrow();
  });

  it("refuses an entry whose shape drifted anywhere else", () => {
    expect(() => parseAuditEntry({ ...ENTRY, at: "yesterday" })).toThrow();
    expect(() => parseAuditEntry({ ...ENTRY, result: "nonsense" })).toThrow();
  });
});

describe("getAuditEntry", () => {
  it("asks console_audit_entry for the one id, under the name the function gave it", async () => {
    const { db, rpc } = dbAnswering({ data: ENTRY });
    const entry = await getAuditEntry("5a000000-0000-4000-8000-000000000013", db);
    expect(rpc).toHaveBeenCalledWith("console_audit_entry", { p_id: "5a000000-0000-4000-8000-000000000013" });
    expect(entry?.keyName).toBe("YubiKey 5C");
  });

  it("answers null for an id that is not there, without raising", async () => {
    const { db } = dbAnswering({ data: null });
    await expect(getAuditEntry("00000000-0000-4000-8000-00000000dead", db)).resolves.toBeNull();
  });

  it("answers a database refusal with the console's own no-access line, never Postgres's", async () => {
    const { db } = dbAnswering({ error: { message: "no access", code: "42501" } });
    await expect(getAuditEntry("5a000000-0000-4000-8000-000000000013", db)).rejects.toMatchObject({
      code: "INVALID_INPUT",
      message: "You don't have access to this.",
    });
  });

  it("fails closed on a shape console_audit_entry never produces", async () => {
    const { db } = dbAnswering({ data: { ...ENTRY, environment: null } });
    await expect(getAuditEntry("5a000000-0000-4000-8000-000000000013", db)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
  });
});
