import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AuditEntry } from "@/console/audit/audit";
import { consoleMessages } from "@/console/messages";
import { ChecksPlate, QuotaPlate, RecentPlate, ServicePlate } from "@/console/overview/overview-plates";

// ---------------------------------------------------------------------------
// Module 01's four plates, drawn from fixtures. Every plate has an "unknown"
// state, and each is asserted to draw that state instead of a zero: a meter at
// nothing and a bar at 0% both read as a quiet day.
// ---------------------------------------------------------------------------

const m = consoleMessages.overview;
const NOW = new Date("2026-09-28T09:00:00Z"); // 14:30 IST

describe("ServicePlate", () => {
  it("draws each row's name, word and notes", () => {
    render(
      <ServicePlate
        rows={[
          { name: m.service.names.checks, row: { lamp: "half", word: m.service.words.degraded, notes: [m.service.budgetUsed] } },
          { name: m.service.names.store, row: { lamp: "lit", word: m.service.words.connected, notes: [] } },
        ]}
      />,
    );
    const plate = screen.getByRole("region", { name: m.service.title });
    const checks = within(plate).getByText(m.service.names.checks).closest("li");
    expect(checks).toHaveTextContent(m.service.words.degraded);
    expect(checks).toHaveTextContent(m.service.budgetUsed);
    expect(within(plate).getByText(m.service.names.store).closest("li")).toHaveTextContent(m.service.words.connected);
  });
});

describe("ChecksPlate", () => {
  it("draws the budget as a meter an assistive reader can hear the figures of", () => {
    render(<ChecksPlate budget={{ configured: true, used: 157, limit: 300 }} />);
    expect(screen.getByRole("img", { name: `${m.checks.budget}: ${m.checks.budgetOf("157", "300")}` })).toBeInTheDocument();
  });

  it("says the counts are unavailable rather than drawing a meter at nothing", () => {
    render(<ChecksPlate budget={{ configured: true, used: null, limit: 300 }} />);
    expect(screen.getByRole("status")).toHaveTextContent(m.checks.unavailable);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("says there is no budget on a deployment that asks no third-party source", () => {
    render(<ChecksPlate budget={{ configured: false, used: null, limit: 300 }} />);
    expect(screen.getByText(m.checks.noBudget)).toBeInTheDocument();
  });

  it("says once that the per-outcome figures are not recorded", () => {
    render(<ChecksPlate budget={{ configured: true, used: 157, limit: 300 }} />);
    expect(screen.getByText(m.checks.notRecorded)).toBeInTheDocument();
  });
});

describe("QuotaPlate", () => {
  it("draws the month against the plan, in the product's own number format, with the reset day", () => {
    render(<QuotaPlate configured quota={{ used: 3412, plan: 100_000, share: 0.03412, unreadDays: 0 }} resets="1 Oct" />);
    expect(screen.getByRole("img", { name: `${m.quota.railkit}: ${m.quota.of("3,412", "1,00,000", "1 Oct")}` })).toBeInTheDocument();
  });

  it("says how many days are missing from the total rather than passing a lower bound off as the figure", () => {
    render(<QuotaPlate configured quota={{ used: 150, plan: 100_000, share: 0.0015, unreadDays: 2 }} resets="1 Oct" />);
    expect(screen.getByText(m.quota.unreadDays(2))).toBeInTheDocument();
  });

  it("says the counts are unavailable when no day could be read", () => {
    render(<QuotaPlate configured quota={null} resets="1 Oct" />);
    expect(screen.getByRole("status")).toHaveTextContent(m.quota.unavailable);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("says there is no quota on a deployment that asks no third-party source", () => {
    render(<QuotaPlate configured={false} quota={null} resets="1 Oct" />);
    expect(screen.getByText(m.quota.notConfigured)).toBeInTheDocument();
  });
});

function entry(at: string, actorName: string, action: string): AuditEntry {
  return {
    id: `${at}-${action}`,
    at,
    environment: "production",
    actorId: null,
    actorName,
    actorRole: "owner",
    keyId: null,
    sessionLabel: null,
    category: "configure",
    action,
    target: null,
    reason: null,
    result: "done",
    addressHash: null,
    before: null,
    after: null,
  };
}

describe("RecentPlate", () => {
  it("draws the entries as a captioned table of time, member and action", () => {
    render(<RecentPlate now={NOW} entries={[entry("2026-09-28T14:02:00+05:30", "Asha Rao", "Changed a switch"), entry("2026-09-26T13:41:00+05:30", "Kiran Das", "Signed in")]} />);
    const table = screen.getByRole("table", { name: m.recent.caption });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("14:02 IST");
    expect(rows[1]).toHaveTextContent("Asha Rao");
    expect(rows[1]).toHaveTextContent("Changed a switch");
    expect(rows[2]).toHaveTextContent("26 Sept, 13:41 IST");
  });

  it("links to the audit log without prefetching it — an open of that page writes an audit row", () => {
    render(<RecentPlate now={NOW} entries={[]} />);
    expect(screen.getByRole("link", { name: m.recent.open })).toHaveAttribute("href", "/audit-log");
  });

  it("says so when nothing is recorded yet", () => {
    render(<RecentPlate now={NOW} entries={[]} />);
    expect(screen.getByText(m.recent.empty)).toBeInTheDocument();
  });

  it("says so when the log could not be read, rather than drawing it empty", () => {
    render(<RecentPlate now={NOW} entries={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(m.recent.unreadable);
    expect(screen.queryByText(m.recent.empty)).not.toBeInTheDocument();
  });
});
