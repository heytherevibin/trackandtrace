import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { shortHash } from "@/console/abuse/abuse";
import { BlockedPlate, LimitsPlate, MostLimitedPlate } from "@/console/abuse/abuse-plates";
import type { Block } from "@/services/blocklist";
import { consoleMessages } from "@/console/messages";

// ---------------------------------------------------------------------------
// Module 04's three plates. Every one has an unknown state and draws it: a
// table with no rows reads as a quiet day, and a store that did not answer is not one.
// ---------------------------------------------------------------------------

const m = consoleMessages.abuse;
const T0 = Date.parse("2026-09-28T04:30:00Z"); // 10:00 IST

describe("shortHash", () => {
  it("shows the first four and last four characters, as the sheet draws a3f9…c2c1", () => {
    expect(shortHash("a3f9Qx7_Lm0pZZc2c1")).toBe("a3f9…c2c1");
  });

  it("leaves a hash already that short alone", () => {
    expect(shortHash("abcd1234")).toBe("abcd1234");
  });
});

describe("LimitsPlate", () => {
  it("states the limit, the live checks and the day's refusals, and links to where the budget changes", () => {
    render(<LimitsPlate perMinute={20} live={{ used: 157, limit: 300 }} limitedToday={3} store="connected" />);
    const plate = screen.getByRole("region", { name: m.limits.title });
    expect(plate).toHaveTextContent(m.limits.rule(20));
    expect(plate).toHaveTextContent(m.limits.live("157", "300"));
    expect(plate).toHaveTextContent(m.limits.limited("3"));
    expect(within(plate).getByRole("link", { name: m.limits.change })).toHaveAttribute("href", "/settings");
  });

  it("says it cannot say, rather than 0, for a count it could not read", () => {
    render(<LimitsPlate perMinute={20} live={{ used: null, limit: 300 }} limitedToday={null} store="unreachable" />);
    expect(screen.getByText(m.limits.liveUnknown)).toBeInTheDocument();
    expect(screen.getByText(m.limits.limitedUnknown)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(m.storeUnavailable);
  });

  it("says the limits are this server's own when no shared store is configured", () => {
    render(<LimitsPlate perMinute={20} live={null} limitedToday={0} store="local" />);
    expect(screen.getByText(m.localOnly)).toBeInTheDocument();
    expect(screen.getByText(m.limits.noBudget)).toBeInTheDocument();
  });
});

describe("MostLimitedPlate", () => {
  it("draws the busiest addresses as hashes, tagging an IPv6 network, with times in IST", () => {
    render(
      <MostLimitedPlate
        environment="production"
        today={{
          total: 5,
          top: [
            { hash: "a3f9Qx7_Lm0pZZc2c1", network: "ipv6", times: 4, firstSeen: T0, lastSeen: T0 + 3_600_000 },
            { hash: "bbbbCCCCddddEEEE", network: "ipv4", times: 1, firstSeen: T0, lastSeen: T0 },
          ],
        }}
      />,
    );
    const table = screen.getByRole("table", { name: m.mostLimited.caption });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("a3f9…c2c1");
    expect(rows[1]).toHaveTextContent(m.mostLimited.ipv6);
    expect(rows[1]).toHaveTextContent("4");
    expect(rows[1]).toHaveTextContent("10:00 IST");
    expect(rows[1]).toHaveTextContent("11:00 IST");
    expect(rows[2]).not.toHaveTextContent(m.mostLimited.ipv6);
  });

  it("says so on a quiet day", () => {
    render(<MostLimitedPlate environment="production" today={{ total: 0, top: [] }} />);
    expect(screen.getByText(m.mostLimited.quiet)).toBeInTheDocument();
  });

  it("says the counts are unavailable when the log could not be read, never a quiet day", () => {
    render(<MostLimitedPlate environment="production" today={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(m.mostLimited.unavailable);
    expect(screen.queryByText(m.mostLimited.quiet)).not.toBeInTheDocument();
  });

  it("offers Block on each row, for the hash already in hand", () => {
    render(<MostLimitedPlate environment="production" today={{ total: 1, top: [{ hash: "abcdEFGHijkl", network: "ipv4", times: 1, firstSeen: T0, lastSeen: T0 }] }} />);
    expect(screen.getByRole("button", { name: m.block.rowTrigger("abcd…ijkl") })).toBeInTheDocument();
  });
});

const BLOCK: Block = {
  member: `6.${"q".repeat(39)}c2c1`,
  hash: `${"q".repeat(39)}c2c1`,
  network: "ipv6",
  note: "Scripted checks",
  by: "Asha Rao",
  since: T0,
  until: null,
  keyId: "k1",
  refused: 12,
};

describe("BlockedPlate", () => {
  it("draws each block: its hash, note, who, since, until and the refusals since, with Unblock", () => {
    render(<BlockedPlate environment="production" keyId="k1" blocks={[BLOCK, { ...BLOCK, member: `4.${"r".repeat(43)}`, hash: "r".repeat(43), network: "ipv4", until: T0 + 3_600_000, refused: 0 }]} />);
    const rows = within(screen.getByRole("table", { name: m.blocked.caption })).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("qqqq…c2c1");
    expect(rows[1]).toHaveTextContent(m.mostLimited.ipv6);
    expect(rows[1]).toHaveTextContent("Scripted checks");
    expect(rows[1]).toHaveTextContent("Asha Rao");
    expect(rows[1]).toHaveTextContent(m.blocked.untilRemoved);
    expect(rows[1]).toHaveTextContent("12");
    expect(rows[2]).toHaveTextContent("11:00 IST");
    expect(within(rows[1]!).getByRole("button", { name: m.blocked.unblock("qqqq…c2c1") })).toBeInTheDocument();
  });

  it("says so when nothing is blocked", () => {
    render(<BlockedPlate environment="production" keyId="k1" blocks={[]} />);
    expect(screen.getByText(m.blocked.none)).toBeInTheDocument();
  });

  it("says the blocks are unavailable when the store did not answer, never 'No addresses are blocked'", () => {
    render(<BlockedPlate environment="production" keyId="k1" blocks={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(m.blocked.unavailable);
    expect(screen.queryByText(m.blocked.none)).not.toBeInTheDocument();
  });

  it("counts the blocks made under an older address key, which no longer match anything", () => {
    render(<BlockedPlate environment="production" keyId="k2" blocks={[BLOCK, { ...BLOCK, member: `4.${"s".repeat(43)}`, keyId: "k2" }]} />);
    expect(screen.getByText(m.blocked.stale(1))).toBeInTheDocument();
  });
});
