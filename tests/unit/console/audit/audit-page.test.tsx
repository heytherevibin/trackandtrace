import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditPage } from "@/console/audit/audit";
import type { AuditMemberOption } from "@/console/audit/filters";
import type { ConsoleAuditRow } from "@/console/auth/audit";
import type { ConsoleMember, ConsoleRole } from "@/console/auth/member";
import { consoleMessages } from "@/console/messages";
import { AppError } from "@/services/errors";

// ConsoleFrame is stood in for rather than rendered: it is an async server component that reads
// next/headers, so @testing-library/react cannot render it at all (its own note says so, and
// tests/unit/console/team/team-page.test.tsx makes the same point). Everything else the page
// composes -- the real PageHeader, the real NoAccessState, the real EntriesPlate -- runs.
const { requireConsoleMember, getAuditLog, getAuditActors, writeConsoleAudit, headerStore } = vi.hoisted(() => ({
  requireConsoleMember: vi.fn<(least?: string) => Promise<ConsoleMember>>(),
  getAuditLog: vi.fn<() => Promise<AuditPage>>(),
  getAuditActors: vi.fn<() => Promise<readonly AuditMemberOption[]>>(),
  writeConsoleAudit: vi.fn<(db: unknown, row: ConsoleAuditRow) => Promise<void>>(),
  headerStore: new Map<string, string>(),
}));

vi.mock("@/console/auth/guard", () => ({ requireConsoleMember }));
vi.mock("@/console/audit/audit", async (importOriginal) => ({ ...(await importOriginal<object>()), getAuditLog, getAuditActors }));
vi.mock("@/console/auth/audit", () => ({ writeConsoleAudit }));
vi.mock("@/console/auth/db", () => ({ createConsoleServiceDb: () => ({}) }));
vi.mock("@/console/components/console-frame", () => ({ ConsoleFrame: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((to: string) => { throw new Error(`redirect:${to}`); }) }));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve({ get: (key: string) => headerStore.get(key) ?? null }) }));
// `after` runs its callback inline here, so a test can assert what the page scheduled -- the same
// stand-in tests/integration/console/team.test.ts uses for the invite letter.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

import AuditLogPage from "@/app/console/audit-log/page";

const m = consoleMessages.audit;

const ASHA: ConsoleMember = { userId: "a0000000-0000-4000-8000-000000000001", email: "asha@trakline.in", name: "Asha Rao", role: "owner", status: "active" };
const EMPTY: AuditPage = { rows: [], total: 0 };
/** In the roster and in no row: the member Task 6 exists to make selectable. */
const DEVI: AuditMemberOption = { id: "e0000000-0000-4000-8000-000000000005", name: "Devi Menon" };

function member(role: ConsoleRole): ConsoleMember {
  return { ...ASHA, role };
}

async function open(search: Record<string, string> = {}) {
  return AuditLogPage({ searchParams: Promise.resolve(search) });
}

beforeEach(() => {
  requireConsoleMember.mockReset().mockResolvedValue(ASHA);
  getAuditLog.mockReset().mockResolvedValue(EMPTY);
  getAuditActors.mockReset().mockResolvedValue([DEVI]);
  writeConsoleAudit.mockReset().mockResolvedValue();
  headerStore.clear();
  headerStore.set("user-agent", "Mozilla/5.0 (Macintosh) Chrome/140.0");
});

describe("who may open the Audit log", () => {
  // task-2-addendum.md §6: the guard call carries no role floor, or there is no `member` left to
  // render NoAccessState with. The floor lives in console_audit itself, and in the GET route.
  it("asks the guard for a member, not for a role", async () => {
    render(await open());
    expect(requireConsoleMember).toHaveBeenCalledWith();
  });

  it("draws the page for an Owner", async () => {
    render(await open());
    expect(screen.getByRole("heading", { level: 1, name: m.title })).toBeInTheDocument();
    expect(screen.getByText(m.lead)).toBeInTheDocument();
  });

  // The sheet's access map gives module 14 to Owner and Admin both (Main.dc.html:293-298), and
  // console.require_role('admin') is a floor rather than an equality.
  it("draws the page for an Admin too", async () => {
    requireConsoleMember.mockResolvedValue(member("admin"));
    render(await open());
    expect(screen.getByRole("heading", { level: 1, name: m.title })).toBeInTheDocument();
  });

  it.each(["support", "viewer"] as const)("gives a %s the sheet's no-access state inside the frame, not a redirect", async (role) => {
    requireConsoleMember.mockResolvedValue(member(role));
    render(await open());
    expect(screen.getByText(consoleMessages.frame.states.noAccess.title(consoleMessages.frame.roleLabel[role]))).toBeInTheDocument();
    expect(screen.getByText(consoleMessages.frame.states.noAccess.detail)).toBeInTheDocument();
    expect(getAuditLog).not.toHaveBeenCalled();
  });

  it("sends a member with no session to sign in", async () => {
    requireConsoleMember.mockRejectedValue(new AppError("UNAUTHENTICATED", "Your session ended. Sign in again.", { status: 401 }));
    await expect(open()).rejects.toThrow("redirect:/login");
  });

  // Only UNAUTHENTICATED is caught, exactly as /keys and /team do: a console whose grants are wrong
  // or a database that is down is a fault, not an ordinary sign-out.
  it("lets every other guard failure reach the console's error boundary", async () => {
    requireConsoleMember.mockRejectedValue(new AppError("INTERNAL", "The console couldn't reach its database."));
    await expect(open()).rejects.toMatchObject({ code: "INTERNAL" });
  });
});

describe("reading the log is itself audited", () => {
  // task-2-addendum.md §5: the page writes one row per server render; the GET route the client
  // re-fetches from for paging and filtering writes none, or an Owner scrolling their own log
  // floods it. The sheet draws the row itself (AuditLog.dc.html:312).
  it("writes one Opened the audit log row for the member who opened it", async () => {
    render(await open());
    expect(writeConsoleAudit).toHaveBeenCalledOnce();
    expect(writeConsoleAudit.mock.calls[0]?.[1]).toMatchObject({
      actor: ASHA.userId,
      actorName: ASHA.name,
      actorRole: "owner",
      action: "Opened the audit log",
      target: "Audit log",
      result: "done",
      sessionLabel: "Chrome on macOS",
    });
  });

  // The sheet draws exactly this row for a Viewer: "Opened the audit log" / "Refused".
  it("records the refusal when a role that may not read it opens the page", async () => {
    requireConsoleMember.mockResolvedValue(member("viewer"));
    render(await open());
    expect(writeConsoleAudit.mock.calls[0]?.[1]).toMatchObject({ actorRole: "viewer", result: "refused" });
  });

  // Next prefetches the rail's own links. A prefetch is not someone opening the log, and an
  // append-only record of something that did not happen cannot be taken back.
  it("writes nothing for a router prefetch", async () => {
    headerStore.set("next-router-prefetch", "1");
    render(await open());
    expect(writeConsoleAudit).not.toHaveBeenCalled();
  });

  it("never lets a failed write take the page down with it", async () => {
    writeConsoleAudit.mockRejectedValue(new Error("the audit log is append-only"));
    render(await open());
    expect(screen.getByRole("heading", { level: 1, name: m.title })).toBeInTheDocument();
  });
});

describe("the first page of entries", () => {
  it("reads the log with the filters the address carries", async () => {
    render(await open({ result: "failed", q: "pnr", page: "2" }));
    expect(getAuditLog).toHaveBeenCalledWith(expect.objectContaining({ result: "failed", search: "pnr", offset: 50 }));
  });

  // The sheet draws an in-page error state for this module, unlike /keys, whose brief did not quote
  // one -- so a read that fails is answered here rather than left to the error boundary.
  it("draws the plate's own error state when the first read fails", async () => {
    getAuditLog.mockRejectedValue(new AppError("SOURCE_UNAVAILABLE", "The console couldn't reach its database.", { status: 503 }));
    render(await open());
    expect(screen.getByText(m.error.title)).toBeInTheDocument();
  });
});

/**
 * Task 6. The Member picker used to accumulate its options from the rows it had fetched, so a member
 * who had done nothing in the chosen range could not be selected -- which is exactly when a reader
 * wants to ask whether they have. The page reads the roster here, once, and hands it down whole.
 */
describe("the Member filter's roster", () => {
  it("reads it for the whole log, whatever the address filters by", async () => {
    render(await open({ result: "failed", q: "pnr", range: "30d" }));
    expect(getAuditActors).toHaveBeenCalledTimes(1);
    expect(getAuditActors).toHaveBeenCalledWith();
  });

  it("offers a member the rows on screen do not name", async () => {
    render(await open());
    expect(within(screen.getByRole("combobox", { name: m.filters.member })).getByRole("option", { name: DEVI.name })).toBeInTheDocument();
  });

  // A picker that could not load its options must not take the table down with it: the rows are the
  // page, and the filter is a way to narrow them. The plate falls back to the actors its own rows
  // name, which is what this picker did before Task 6.
  it("still draws the log when the roster could not be read", async () => {
    getAuditActors.mockRejectedValue(new AppError("SOURCE_UNAVAILABLE", "The console couldn't reach its database.", { status: 503 }));
    render(await open());
    expect(screen.getByRole("heading", { level: 1, name: m.title })).toBeInTheDocument();
    expect(screen.queryByText(m.error.title)).toBeNull();
    expect(within(screen.getByRole("combobox", { name: m.filters.member })).queryByRole("option", { name: DEVI.name })).toBeNull();
  });

  // Reading a roster is reading: the one row this page records is the "Opened the audit log" row
  // that `recordOpened` writes, and the roster must not add a second.
  it("writes no audit row of its own", async () => {
    render(await open());
    expect(writeConsoleAudit).toHaveBeenCalledTimes(1);
    expect(writeConsoleAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "Opened the audit log" }));
  });
});
