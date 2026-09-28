import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { shortHash } from "@/console/abuse/abuse";
import { LimitsPlate, MostLimitedPlate } from "@/console/abuse/abuse-plates";
import { consoleMessages } from "@/console/messages";

// ---------------------------------------------------------------------------
// Module 04, PR A: the two read-only plates. Blocking is PR B — nothing
// enforces a block yet, so neither plate draws a Block control.
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
    render(<MostLimitedPlate today={{ total: 0, top: [] }} />);
    expect(screen.getByText(m.mostLimited.quiet)).toBeInTheDocument();
  });

  it("says the counts are unavailable when the log could not be read, never a quiet day", () => {
    render(<MostLimitedPlate today={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(m.mostLimited.unavailable);
    expect(screen.queryByText(m.mostLimited.quiet)).not.toBeInTheDocument();
  });

  it("draws no Block control: nothing enforces a block until PR B", () => {
    render(<MostLimitedPlate today={{ total: 1, top: [{ hash: "abcdEFGHijkl", network: "ipv4", times: 1, firstSeen: T0, lastSeen: T0 }] }} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
