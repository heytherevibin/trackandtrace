import { describe, expect, it } from "vitest";
import {
  auditFiltersToSearch,
  auditQueryFor,
  auditRangeBounds,
  AUDIT_PAGE_SIZE,
  clearAuditFilters,
  defaultAuditFilters,
  hasActiveAuditFilters,
  parseAuditFilters,
  type AuditFilters,
} from "@/console/audit/filters";

const ENVIRONMENT = "production";

/** The query string as Next hands a page its searchParams, and as the GET route rebuilds it. */
function fromSearch(search: string): Record<string, string | string[] | undefined> {
  return Object.fromEntries(new URLSearchParams(search));
}

function roundTrip(filters: AuditFilters): AuditFilters {
  return parseAuditFilters(fromSearch(auditFiltersToSearch(filters, ENVIRONMENT)), ENVIRONMENT);
}

describe("defaultAuditFilters", () => {
  // task-2-addendum.md §4: the filter defaults to consoleEnvironment() and the member can clear it.
  it("opens on today, in this deployment's own environment, on page one", () => {
    expect(defaultAuditFilters(ENVIRONMENT)).toEqual({
      range: "today",
      from: null,
      to: null,
      member: null,
      category: null,
      result: null,
      environment: "production",
      search: "",
      page: 1,
    });
  });

  it("carries no active filter of its own", () => {
    expect(hasActiveAuditFilters(defaultAuditFilters(ENVIRONMENT), ENVIRONMENT)).toBe(false);
  });
});

describe("the query string", () => {
  it("writes nothing at all for the default view, so the page's own address stays clean", () => {
    expect(auditFiltersToSearch(defaultAuditFilters(ENVIRONMENT), ENVIRONMENT)).toBe("");
  });

  it("round-trips every filter a member can set", () => {
    const filters: AuditFilters = {
      range: "30d",
      from: null,
      to: null,
      member: "a0000000-0000-4000-8000-000000000001",
      category: "messages",
      result: "refused",
      environment: "preview",
      search: "maintenance window",
      page: 3,
    };
    expect(roundTrip(filters)).toEqual(filters);
  });

  it("round-trips a custom range", () => {
    const filters: AuditFilters = { ...defaultAuditFilters(ENVIRONMENT), range: "custom", from: "2026-09-01", to: "2026-09-03" };
    expect(roundTrip(filters)).toEqual(filters);
  });

  // "Every row shows its environment ... and the member can clear it" (task-2-addendum.md §4). A
  // cleared environment is a real state with its own address, not the absence of one -- an absent
  // `env` is the default, so clearing needs a token of its own.
  it("round-trips a cleared environment, which is not the same as an absent one", () => {
    const cleared: AuditFilters = { ...defaultAuditFilters(ENVIRONMENT), environment: null };
    expect(auditFiltersToSearch(cleared, ENVIRONMENT)).toContain("env=all");
    expect(roundTrip(cleared)).toEqual(cleared);
  });

  it("takes an unreadable query string back to the default view rather than refusing it", () => {
    expect(parseAuditFilters(fromSearch("range=last-tuesday&result=nonsense&member=not-a-uuid&page=-4"), ENVIRONMENT)).toEqual(
      defaultAuditFilters(ENVIRONMENT),
    );
  });

  it("trims the search box and treats whitespace as no search at all", () => {
    expect(parseAuditFilters(fromSearch("q=%20%20%20"), ENVIRONMENT).search).toBe("");
    expect(parseAuditFilters(fromSearch("q=%20pnr%20"), ENVIRONMENT).search).toBe("pnr");
  });

  it("drops a from/to that is not a calendar day", () => {
    const parsed = parseAuditFilters(fromSearch("range=custom&from=2026-13-40&to=yesterday"), ENVIRONMENT);
    expect(parsed).toMatchObject({ range: "custom", from: null, to: null });
  });
});

describe("hasActiveAuditFilters", () => {
  it("counts every picker, the search box and an environment that is not this deployment's", () => {
    const base = defaultAuditFilters(ENVIRONMENT);
    expect(hasActiveAuditFilters({ ...base, category: "messages" }, ENVIRONMENT)).toBe(true);
    expect(hasActiveAuditFilters({ ...base, result: "failed" }, ENVIRONMENT)).toBe(true);
    expect(hasActiveAuditFilters({ ...base, member: "a0000000-0000-4000-8000-000000000001" }, ENVIRONMENT)).toBe(true);
    expect(hasActiveAuditFilters({ ...base, search: "pnr" }, ENVIRONMENT)).toBe(true);
    expect(hasActiveAuditFilters({ ...base, environment: null }, ENVIRONMENT)).toBe(true);
  });

  // The range has its own control and is never "cleared" -- Clear filters takes it back to Today.
  it("does not count the date range, which is a choice rather than a filter", () => {
    expect(hasActiveAuditFilters({ ...defaultAuditFilters(ENVIRONMENT), range: "30d" }, ENVIRONMENT)).toBe(false);
  });
});

describe("clearAuditFilters", () => {
  it("takes everything back to the default view", () => {
    const busy: AuditFilters = { range: "custom", from: "2026-09-01", to: "2026-09-03", member: "a0000000-0000-4000-8000-000000000001", category: "messages", result: "refused", environment: null, search: "pnr", page: 7 };
    expect(clearAuditFilters(busy, ENVIRONMENT)).toEqual(defaultAuditFilters(ENVIRONMENT));
  });
});

describe("auditRangeBounds", () => {
  // Every range is an IST calendar day, and the day is read in IST rather than UTC: at 02:00 IST it
  // is already tomorrow in Kolkata and still yesterday in UTC, and "Today" must mean the member's
  // own day. Half-open throughout (task-2-addendum.md §3): p_to is the start of the next day, never
  // 23:59:59.999, so two adjacent ranges partition a day instead of both claiming the seam.
  const AFTER_IST_MIDNIGHT = new Date("2026-09-23T02:00:00+05:30");

  it("reads Today as the IST calendar day, not the UTC one", () => {
    expect(auditRangeBounds({ ...defaultAuditFilters(ENVIRONMENT), range: "today" }, AFTER_IST_MIDNIGHT)).toEqual({
      from: "2026-09-22T18:30:00.000Z",
      to: "2026-09-23T18:30:00.000Z",
    });
  });

  it("gives 7 days today and the six before it, ending at the start of tomorrow", () => {
    expect(auditRangeBounds({ ...defaultAuditFilters(ENVIRONMENT), range: "7d" }, AFTER_IST_MIDNIGHT)).toEqual({
      from: "2026-09-16T18:30:00.000Z",
      to: "2026-09-23T18:30:00.000Z",
    });
  });

  it("gives 30 days today and the twenty-nine before it", () => {
    expect(auditRangeBounds({ ...defaultAuditFilters(ENVIRONMENT), range: "30d" }, AFTER_IST_MIDNIGHT)).toEqual({
      from: "2026-08-24T18:30:00.000Z",
      to: "2026-09-23T18:30:00.000Z",
    });
  });

  // The member picks two inclusive days; the database is asked for a half-open interval, so the
  // second one becomes the start of the day after it.
  it("makes a custom range half-open by passing the start of the day after the one chosen", () => {
    expect(auditRangeBounds({ ...defaultAuditFilters(ENVIRONMENT), range: "custom", from: "2026-09-01", to: "2026-09-03" }, AFTER_IST_MIDNIGHT)).toEqual({
      from: "2026-08-31T18:30:00.000Z",
      to: "2026-09-03T18:30:00.000Z",
    });
  });

  it("leaves an unset half of a custom range unbounded rather than guessing at it", () => {
    expect(auditRangeBounds({ ...defaultAuditFilters(ENVIRONMENT), range: "custom", from: null, to: null }, AFTER_IST_MIDNIGHT)).toEqual({
      from: null,
      to: null,
    });
  });
});

describe("auditQueryFor", () => {
  const NOW = new Date("2026-09-23T02:00:00+05:30");

  it("asks for one page at the size console_audit already defaults to, never more", () => {
    expect(AUDIT_PAGE_SIZE).toBeLessThanOrEqual(200);
    const query = auditQueryFor({ ...defaultAuditFilters(ENVIRONMENT), page: 3 }, NOW);
    expect(query.limit).toBe(AUDIT_PAGE_SIZE);
    expect(query.offset).toBe(AUDIT_PAGE_SIZE * 2);
  });

  it("sends null, never an empty string, for every filter a member has not set", () => {
    const query = auditQueryFor({ ...defaultAuditFilters(ENVIRONMENT), environment: null }, NOW);
    expect(query).toMatchObject({ member: null, category: null, result: null, search: null, environment: null });
  });

  it("carries the environment the member is looking at", () => {
    expect(auditQueryFor(defaultAuditFilters(ENVIRONMENT), NOW).environment).toBe("production");
  });
});
