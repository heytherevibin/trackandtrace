import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterBar } from "@/console/audit/filter-bar";
import { auditRangeAsDays, defaultAuditFilters, type AuditFilters } from "@/console/audit/filters";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.audit;
const ENVIRONMENT = "production";
const ASHA = { id: "a0000000-0000-4000-8000-000000000001", name: "Asha Rao" };

function bar(filters: AuditFilters = defaultAuditFilters(ENVIRONMENT)) {
  const onChange = vi.fn<(next: AuditFilters) => void>();
  render(<FilterBar filters={filters} environment={ENVIRONMENT} members={[ASHA]} onChange={onChange} />);
  return onChange;
}

describe("the filter bar, as the sheet draws it", () => {
  it("is one search landmark, named", () => {
    bar();
    expect(screen.getByRole("search", { name: m.filters.regionLabel })).toBeInTheDocument();
  });

  it("draws the search box with the sheet's own label and placeholder", () => {
    bar();
    const box = screen.getByRole("searchbox", { name: m.filters.search });
    expect(box).toHaveAttribute("placeholder", m.filters.search);
  });

  it("draws the three pickers the sheet draws, each offering All", () => {
    bar();
    for (const name of [m.filters.member, m.filters.category, m.filters.result]) {
      const picker = screen.getByRole("combobox", { name });
      expect(within(picker).getByRole("option", { name: m.filters.all }).getAttribute("value")).toBe("");
    }
  });

  it("draws the four ranges as one group, with Today chosen", () => {
    bar();
    const group = screen.getByRole("group", { name: m.filters.rangeLabel });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual([
      m.filters.ranges.today,
      m.filters.ranges["7d"],
      m.filters.ranges["30d"],
      m.filters.ranges.custom,
    ]);
    expect(within(group).getByRole("button", { name: m.filters.ranges.today }).getAttribute("aria-pressed")).toBe("true");
  });

  it("offers the actors it has seen in the Member picker", () => {
    bar();
    expect(within(screen.getByRole("combobox", { name: m.filters.member })).getByRole("option", { name: ASHA.name })).toBeInTheDocument();
  });
});

describe("changing a filter", () => {
  it("takes the reader back to the first page, so a narrower set cannot open on a page that no longer exists", async () => {
    const onChange = bar({ ...defaultAuditFilters(ENVIRONMENT), page: 4 });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: m.filters.result }), "refused");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ result: "refused", page: 1 }));
  });

  it("clears a picker back to null rather than to an empty string, which the database reads as match-nothing", async () => {
    const onChange = bar({ ...defaultAuditFilters(ENVIRONMENT), category: "messages" });
    await userEvent.selectOptions(screen.getByRole("combobox", { name: m.filters.category }), "");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ category: null }));
  });

  it("switches the range", async () => {
    const onChange = bar();
    await userEvent.click(screen.getByRole("button", { name: m.filters.ranges["7d"] }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ range: "7d", page: 1 }));
  });

  // A request per keystroke against two years of history is not a search box, it is a load test.
  it("applies the search when it is submitted, not on every keystroke", async () => {
    const onChange = bar();
    await userEvent.type(screen.getByRole("searchbox", { name: m.filters.search }), "maintenance");
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ search: "maintenance", page: 1 }));
  });

  it("offers the two day boxes only once the range is Custom", async () => {
    bar();
    expect(screen.queryByLabelText(m.filters.customFrom)).toBeNull();
    render(<FilterBar filters={{ ...defaultAuditFilters(ENVIRONMENT), range: "custom", from: "2026-09-01", to: "2026-09-03" }} environment={ENVIRONMENT} members={[]} onChange={vi.fn()} />);
    expect(screen.getByLabelText(m.filters.customFrom)).toBeInTheDocument();
    expect(screen.getByLabelText(m.filters.customTo)).toBeInTheDocument();
  });

  // Custom with neither day chosen is not a range: it would ask console_audit for an unbounded scan
  // and a count(*) over two years, under a caption reading "for the chosen dates". Seeding it with
  // the range already on screen is what makes "Custom" mean "refine this".
  it("seeds the two day boxes from the range already on screen when Custom is picked", async () => {
    const onChange = bar({ ...defaultAuditFilters(ENVIRONMENT), range: "7d" });
    await userEvent.click(screen.getByRole("button", { name: m.filters.ranges.custom }));
    const next = onChange.mock.calls[0]?.[0];
    expect(next).toMatchObject({ range: "custom" });
    expect(next?.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(next?.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(auditRangeAsDays("7d", new Date())).toEqual({ from: next?.from, to: next?.to });
  });

  it("clears the day boxes again when a fixed range is picked, so a stale pair cannot ride along", async () => {
    const onChange = bar({ ...defaultAuditFilters(ENVIRONMENT), range: "custom", from: "2026-09-01", to: "2026-09-03" });
    await userEvent.click(screen.getByRole("button", { name: m.filters.ranges["30d"] }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ range: "30d", from: null, to: null }));
  });
});

describe("the active-filter row", () => {
  it("is absent until something is filtered", () => {
    bar();
    expect(screen.queryByText(m.filters.active)).toBeNull();
    expect(screen.queryByRole("button", { name: m.filters.clear })).toBeNull();
  });

  it("names each active filter the way the sheet names it, and offers to remove it", () => {
    bar({ ...defaultAuditFilters(ENVIRONMENT), category: "messages" });
    const chip = m.filters.chip(m.filters.category, m.categories.messages);
    expect(screen.getByText(m.filters.active)).toBeInTheDocument();
    expect(screen.getByText(chip)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: m.filters.remove(chip) })).toBeInTheDocument();
  });

  it("takes one chip off without touching the others", async () => {
    const onChange = bar({ ...defaultAuditFilters(ENVIRONMENT), category: "messages", result: "failed" });
    await userEvent.click(screen.getByRole("button", { name: m.filters.remove(m.filters.chip(m.filters.category, m.categories.messages)) }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ category: null, result: "failed" }));
  });

  // task-2-addendum.md §4: the environment filter defaults to this deployment's own and the member
  // can clear it -- "did a preview deployment write to production?" is answerable only from preview
  // rows. It is a chip only once it stops being the default.
  it("chips the environment only when it is not this deployment's own", () => {
    bar();
    expect(screen.queryByText(m.filters.chip(m.filters.environment, ENVIRONMENT))).toBeNull();
    render(<FilterBar filters={{ ...defaultAuditFilters(ENVIRONMENT), environment: null }} environment={ENVIRONMENT} members={[]} onChange={vi.fn()} />);
    expect(screen.getByText(m.filters.chip(m.filters.environment, m.filters.all))).toBeInTheDocument();
  });

  it("clears everything at once", async () => {
    const onChange = bar({ ...defaultAuditFilters(ENVIRONMENT), category: "messages", result: "failed", search: "pnr", page: 5 });
    await userEvent.click(screen.getByRole("button", { name: m.filters.clear }));
    expect(onChange).toHaveBeenCalledWith(defaultAuditFilters(ENVIRONMENT));
  });
});
