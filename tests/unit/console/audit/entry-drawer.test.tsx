import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEntryDetail } from "@/console/audit/audit";
import { consoleMessages } from "@/console/messages";
import { messages } from "@/messages";

// The one thing stood in for: the browser-side read of `console_audit_entry`. Everything else --
// the real dialog, the real KeyValueList, the real message tree -- runs.
const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock("@/services/api-client", () => ({ apiRequest }));

import { EntryDrawer } from "@/console/audit/entry-drawer";

const m = consoleMessages.audit;
const ist = consoleMessages.frameSignedIn.clock.ist;

// 19 Sept 2026, 14:02:31 IST -- the sheet's own entry, in the form the database really writes it:
// an offset rather than a Z, and every fractional digit kept.
const ASHA: AuditEntryDetail = {
  id: "5a000000-0000-4000-8000-000000000013",
  at: "2026-09-19T08:32:31.256374+00:00",
  environment: "production",
  actorId: "a0000000-0000-4000-8000-000000000001",
  actorName: "Asha Rao",
  actorRole: "owner",
  keyId: "f0000000-0000-4000-8000-00000000000f",
  keyName: "YubiKey 5C",
  sessionLabel: "Chrome on macOS",
  category: "configure",
  action: "Paused PNR checks",
  target: "PNR checks",
  reason: "Provider maintenance window, 14:00-15:00 IST.",
  result: "done",
  addressHash: "a3f9…c2c1",
  before: { pnr_checks: "on" },
  after: { pnr_checks: "paused" },
};

// The System row: whole-second `at` (Postgres drops the fractional part at zero microseconds), no
// actor, no role, no key, no session, no address, no reason, no before and no after.
const SYSTEM: AuditEntryDetail = {
  ...ASHA,
  id: "5a000000-0000-4000-8000-000000000001",
  at: "2026-09-18T20:30:00+00:00",
  actorId: null,
  actorName: "System",
  actorRole: null,
  keyId: null,
  keyName: null,
  sessionLabel: null,
  category: "system",
  action: "Purged unconfirmed sign-ups",
  target: null,
  reason: null,
  addressHash: null,
  before: null,
  after: null,
};

function answering(entry: AuditEntryDetail | null) {
  apiRequest.mockResolvedValue({ ok: true, data: { ok: true, entry } });
}

async function open(entry: AuditEntryDetail | null = ASHA) {
  answering(entry);
  render(<EntryDrawer entryId={entry?.id ?? "00000000-0000-4000-8000-00000000dead"} onClose={vi.fn()} />);
  return screen.findByRole("dialog");
}

/** The drawer's own labels, in the order it draws them. */
function labelsOf(dialog: HTMLElement): readonly string[] {
  return [...dialog.querySelectorAll("dt")].map((term) => term.textContent ?? "");
}

/** The value beside one of those labels. */
function valueOf(dialog: HTMLElement, label: string): string {
  const term = within(dialog).getByText(label);
  const value = term.nextElementSibling;
  if (!value) throw new Error(`no value beside "${label}"`);
  return value.textContent ?? "";
}

beforeEach(() => {
  apiRequest.mockReset();
  answering(ASHA);
});

describe("the entry drawer", () => {
  // AuditLog.dc.html:219 -- "Audit entry", with the entry's id beside it in the plate's own meta
  // cell. The sheet's `#58213` is a numeric id this database does not have, so the uuid is shown
  // bare; the `#` would read as "number" over something that is not one (flagged in the report).
  it("is a dialog named in the sheet's own words, with the entry's id beside it", async () => {
    const dialog = await open();
    expect(screen.getByRole("dialog", { name: m.entry.title })).toBe(dialog);
    expect(within(dialog).getByText(ASHA.id)).toBeInTheDocument();
  });

  // The sheet's nine labels in the sheet's own order, plus Environment second -- beside the time,
  // exactly where task-2-addendum.md §4 put it in the table, and for the same reason: the drawer is
  // the thing a member screenshots into a ticket, and a record that will not say which deployment
  // wrote it lies by omission.
  it("draws ten labelled fields, the sheet's nine and Environment beside the time", async () => {
    const dialog = await open();
    expect(labelsOf(dialog)).toEqual([
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
  });

  // The sheet draws "19 Sep 2026, 14:02:31 IST" -- seconds, unlike the table's own cell, which
  // stops at the minute. en-IN's short month is "Sept", as the house formatter prints it.
  it("gives the time to the second, in IST", async () => {
    const dialog = await open();
    expect(valueOf(dialog, m.entry.labels.time)).toBe(`19 Sept 2026, 14:02:31 ${ist}`);
  });

  it("draws every other plain field as the row holds it", async () => {
    const dialog = await open();
    expect(valueOf(dialog, m.entry.labels.environment)).toBe("production");
    expect(valueOf(dialog, m.entry.labels.action)).toBe("Paused PNR checks");
    expect(valueOf(dialog, m.entry.labels.target)).toBe("PNR checks");
    expect(valueOf(dialog, m.entry.labels.reason)).toBe(m.entries.quoted("Provider maintenance window, 14:00-15:00 IST."));
    expect(valueOf(dialog, m.entry.labels.result)).toBe(m.results.done);
    expect(valueOf(dialog, m.entry.labels.address)).toBe("a3f9…c2c1");
    expect(valueOf(dialog, m.entry.labels.session)).toBe("Chrome on macOS");
  });
});

// task-3-addendum.md §2: console.audit_log stores key_id and no key name, so the drawer's Member
// line has three real cases and only one of them is the sheet's.
describe("the Member line", () => {
  it("composes name, role and the key, as the sheet writes it", async () => {
    const dialog = await open();
    expect(valueOf(dialog, m.entry.labels.member)).toBe(`Asha Rao · Owner · ${m.entry.keyNamed("YubiKey 5C")}`);
  });

  // The normal state of an old entry, not an edge case: the record outlives the key and is never
  // rewritten when one is removed. It must say the key is gone, not pretend there was none.
  it("says the key is gone when its id no longer resolves, rather than dropping the clause", async () => {
    const dialog = await open({ ...ASHA, keyName: null });
    expect(valueOf(dialog, m.entry.labels.member)).toBe(`Asha Rao · Owner · ${m.entry.keyGone}`);
    expect(valueOf(dialog, m.entry.labels.member)).not.toBe("Asha Rao · Owner");
  });

  it("carries no key clause at all when the row was written without a key", async () => {
    const dialog = await open(SYSTEM);
    expect(valueOf(dialog, m.entry.labels.member)).toBe("System");
  });
});

// The sheet composes the two jsonb columns into a sentence (:238). All three shapes are real.
describe("Before → after", () => {
  it("pairs each field the two snapshots name", async () => {
    const dialog = await open();
    expect(valueOf(dialog, m.entry.labels.change)).toBe(m.entry.changed("pnr_checks", m.entries.quoted("on"), m.entries.quoted("paused")));
  });

  it("says none for the side a field is missing from", async () => {
    const onlyAfter = await open({ ...ASHA, before: null, after: { notice: "Checks are paused for maintenance." } });
    expect(valueOf(onlyAfter, m.entry.labels.change)).toBe(m.entry.changed("notice", m.entry.changeNone, m.entries.quoted("Checks are paused for maintenance.")));
  });

  it("and for the other side just the same", async () => {
    const onlyBefore = await open({ ...ASHA, before: { notice: "Checks are paused for maintenance." }, after: null });
    expect(valueOf(onlyBefore, m.entry.labels.change)).toBe(m.entry.changed("notice", m.entries.quoted("Checks are paused for maintenance."), m.entry.changeNone));
  });

  it("reads both snapshots, not only the one that happens to be there", async () => {
    const dialog = await open({ ...ASHA, before: { role: "viewer" }, after: { role: "support", note: 2 } });
    expect(valueOf(dialog, m.entry.labels.change)).toBe(
      `${m.entry.changed("role", m.entries.quoted("viewer"), m.entries.quoted("support"))} ${m.entry.changed("note", m.entry.changeNone, "2")}`,
    );
  });

  it("draws the row with the table's own em dash when nothing changed at all", async () => {
    const dialog = await open(SYSTEM);
    expect(valueOf(dialog, m.entry.labels.change)).toBe(m.entries.none);
  });
});

describe("a row with nothing in half its columns", () => {
  // The System row has five null columns. Not one of them may reach the screen as "undefined" or
  // "null" -- the table's own em dash is what a missing value looks like in this module.
  it("draws an em dash for each missing value, and never a stringified nothing", async () => {
    const dialog = await open(SYSTEM);
    for (const label of [m.entry.labels.target, m.entry.labels.reason, m.entry.labels.address, m.entry.labels.session, m.entry.labels.change]) {
      expect(valueOf(dialog, label), label).toBe(m.entries.none);
    }
    expect(dialog.textContent).not.toMatch(/undefined|null|NaN|\[object Object\]/);
  });
});

describe("the drawer's footer", () => {
  // task-3-addendum.md §1 and AuditLog.dc.html:227, word for word. Both halves are true of the
  // shipped database: the append-only trigger refuses update and delete, and console.purge_audit()
  // removes rows older than two years.
  it("says the log cannot be edited and is deleted after two years", async () => {
    const dialog = await open();
    expect(within(dialog).getByText(m.entry.retention)).toBeInTheDocument();
  });
});

describe("what the drawer reads", () => {
  it("asks the route for exactly this entry, once", async () => {
    await open();
    expect(apiRequest).toHaveBeenCalledOnce();
    expect(apiRequest).toHaveBeenCalledWith(expect.stringContaining(`id=${ASHA.id}`), expect.objectContaining({ method: "GET" }), expect.anything());
  });

  // console_audit_entry answers SQL NULL for an id that is not there, with no database message to
  // translate (task-3-addendum.md §3). A member who followed a stale link gets a sentence, not an
  // empty panel.
  it("says so plainly when there is no such entry, rather than drawing an empty panel", async () => {
    const dialog = await open(null);
    expect(within(dialog).getByText(m.entry.missing.title)).toBeInTheDocument();
    expect(within(dialog).getByText(m.entry.missing.detail)).toBeInTheDocument();
    expect(labelsOf(dialog)).toEqual([]);
  });

  it("draws the module's own error state when the read itself fails, and retries from the route", async () => {
    apiRequest.mockResolvedValueOnce({ ok: false, error: { ok: false, code: "SOURCE_UNAVAILABLE", message: "raw driver words" } });
    render(<EntryDrawer entryId={ASHA.id} onClose={vi.fn()} />);
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(m.error.title)).toBeInTheDocument();
    // A database refusal is a developer string and must never reach a member.
    expect(screen.queryByText("raw driver words")).toBeNull();

    answering(ASHA);
    await userEvent.click(within(alert).getByRole("button", { name: m.error.action }));
    expect(await screen.findByText("Paused PNR checks")).toBeInTheDocument();
  });

  it("reads nothing while it is closed", () => {
    render(<EntryDrawer entryId={null} onClose={vi.fn()} />);
    expect(apiRequest).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("closing", () => {
  it("hands the close back to the caller, which owns the open row", async () => {
    const onClose = vi.fn();
    answering(ASHA);
    render(<EntryDrawer entryId={ASHA.id} onClose={onClose} />);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: messages.common.close }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
