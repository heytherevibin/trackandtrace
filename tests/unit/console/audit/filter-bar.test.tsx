import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FilterBar } from "@/console/audit/filter-bar";
import { AUDIT_SEARCH_MAX, auditRangeAsDays, defaultAuditFilters, type AuditFilters, type AuditMemberOption } from "@/console/audit/filters";
import { consoleMessages } from "@/console/messages";

const m = consoleMessages.audit;
const ENVIRONMENT = "production";
const ASHA = { id: "a0000000-0000-4000-8000-000000000001", name: "Asha Rao" };
/**
 * Someone the roster names and the rows on screen do not (Task 6). She is the member this module
 * could not previously offer: `console_audit_actors` reads the whole log, so she is selectable even
 * on a day she did nothing -- which is the day a reader most wants to ask.
 */
const DEVI = { id: "e0000000-0000-4000-8000-000000000005", name: "Devi Menon" };
const ROSTER = [ASHA, DEVI];

function bar(filters: AuditFilters = defaultAuditFilters(ENVIRONMENT), members: readonly AuditMemberOption[] = ROSTER) {
  const onChange = vi.fn<(next: AuditFilters) => void>();
  render(<FilterBar filters={filters} environment={ENVIRONMENT} members={members} onChange={onChange} />);
  return onChange;
}

describe("the filter bar, as the sheet draws it", () => {
  it("is one search landmark, named", () => {
    bar();
    expect(screen.getByRole("search", { name: m.filters.regionLabel })).toBeInTheDocument();
  });

  // Where the bound belongs: the search is the only free-text filter and it travels inside the
  // export's canonical filter object, so an unbounded one makes the export fail *after* the member
  // has typed a reason and tapped their key. Stopping the field is what keeps a ceremony from being
  // spent on a request that could not have succeeded. The same shape the Reason field already has.
  it("stops the search where parseAuditFilters stops", () => {
    bar();
    expect(screen.getByRole("searchbox", { name: m.filters.search })).toHaveAttribute("maxlength", String(AUDIT_SEARCH_MAX));
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
  // Clear filters is what is absent until something is filtered, not the row. The row carries the
  // environment chip from the first paint (see below), and `clearAuditFilters` returns to the
  // default view -- so beside that chip alone the button would visibly do nothing.
  it("offers nothing to clear until something is filtered", () => {
    bar();
    expect(screen.queryByRole("button", { name: m.filters.clear })).toBeNull();
  });

  it("offers it as soon as something is", () => {
    bar({ ...defaultAuditFilters(ENVIRONMENT), category: "messages" });
    expect(screen.getByRole("button", { name: m.filters.clear })).toBeInTheDocument();
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
  /**
   * The environment is chipped at its default, unlike every other filter, and that is the branch
   * review's Critical showing through into the reader.
   *
   * A board opens scoped to its own deployment, so "no export rows" would otherwise be
   * indistinguishable from "no export rows *in production*" -- which is precisely the state an
   * Admin could put an Owner in by filing their own export against a different deployment. The chip
   * is what makes the scope visible instead of inferred.
   */
  it("chips the environment even at its default, so the scope is never inferred", () => {
    bar();
    expect(screen.getByText(m.filters.chip(m.filters.environment, ENVIRONMENT))).toBeInTheDocument();
  });

  it("removes that chip by widening to every environment, not by swapping in another", async () => {
    const onChange = bar();
    await userEvent.click(screen.getByRole("button", { name: m.filters.remove(m.filters.chip(m.filters.environment, ENVIRONMENT)) }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ environment: null }));
  });

  // "Environment: All" is not a filter: nothing is being left out, so there is nothing to remove.
  it("drops the chip once the view is every environment", () => {
    bar({ ...defaultAuditFilters(ENVIRONMENT), environment: null });
    expect(screen.queryByText(m.filters.chip(m.filters.environment, m.filters.all))).toBeNull();
  });

  it("clears everything at once", async () => {
    const onChange = bar({ ...defaultAuditFilters(ENVIRONMENT), category: "messages", result: "failed", search: "pnr", page: 5 });
    await userEvent.click(screen.getByRole("button", { name: m.filters.clear }));
    expect(onChange).toHaveBeenCalledWith(defaultAuditFilters(ENVIRONMENT));
  });

  /**
   * AuditLogPhone.dc.html:92 -- the chip carries `min-height: 44px` and the remove label itself.
   * The chip **is** the control there, where the desktop sheet (:131) draws a tag with a 16px x
   * inside it. One button serves both: two chip rows would put two controls with the same
   * accessible name in the tree at once, and a screen reader cannot tell a member which of them is
   * the real one.
   */
  it("gives the chip a 44px target, because on a phone the chip is the remove control", () => {
    bar({ ...defaultAuditFilters(ENVIRONMENT), category: "messages" });
    const chip = screen.getByRole("button", { name: m.filters.remove(m.filters.chip(m.filters.category, m.categories.messages)) });
    expect(chip.className).toContain("max-sm:min-h-11");
  });
});

/**
 * The phone's own filter row (AuditLogPhone.dc.html:78-88): the four date tabs, and **one** icon
 * button behind which the search and every picker live. The brief said a phone has no pickers; the
 * sheet says it has all of them, one tap away. A phone that cannot filter the audit log is a phone
 * that cannot answer a question about it.
 */
describe("the phone's Search and filters dialog", () => {
  it("draws one trigger, which promises a dialog", () => {
    bar();
    const trigger = screen.getByRole("button", { name: m.filters.phoneTrigger });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    // `sm:hidden`, not a second mount: the desktop bar keeps its own row and CSS picks between
    // them, the pattern ConsoleRail and ConsoleRailDrawer already use.
    expect(trigger.className).toContain("sm:hidden");
  });

  it("holds the search and all four pickers, so nothing the desktop can filter by is lost", async () => {
    bar();
    await userEvent.click(screen.getByRole("button", { name: m.filters.phoneTrigger }));
    const sheet = await screen.findByRole("dialog", { name: m.filters.phoneTrigger });
    expect(within(sheet).getByRole("searchbox", { name: m.filters.search })).toHaveAttribute("maxlength", String(AUDIT_SEARCH_MAX));
    for (const name of [m.filters.member, m.filters.category, m.filters.result, m.filters.environment]) {
      expect(within(sheet).getByRole("combobox", { name }), name).toBeInTheDocument();
    }
  });

  /**
   * The Member picker exists twice -- here and in the wide bar -- and a roster that reached only
   * one of them would leave the phone with the accumulate-from-the-rows-on-screen behaviour Task 6
   * exists to remove, with nothing on screen to say so. Both are one `pickers()` call reading one
   * `members` prop, and this is what holds that: Devi is in the roster and in no row.
   */
  it("offers the whole roster in its Member picker, not only the actors the rows name", async () => {
    bar();
    await userEvent.click(screen.getByRole("button", { name: m.filters.phoneTrigger }));
    const sheet = await screen.findByRole("dialog", { name: m.filters.phoneTrigger });
    const picker = within(sheet).getByRole("combobox", { name: m.filters.member });
    for (const one of ROSTER) expect(within(picker).getByRole("option", { name: one.name }), one.name).toBeInTheDocument();
    expect(within(picker).getByRole("option", { name: m.filters.all })).toBeInTheDocument();
  });

  // The same option values at both widths, so a view filtered on a phone is the view a link opens
  // on a desktop: the picker sends `actor_id`, which is exactly what `p_member` matches on.
  it("sends the roster's own id when a member is picked from the dialog", async () => {
    const onChange = bar();
    await userEvent.click(screen.getByRole("button", { name: m.filters.phoneTrigger }));
    const sheet = await screen.findByRole("dialog", { name: m.filters.phoneTrigger });
    await userEvent.selectOptions(within(sheet).getByRole("combobox", { name: m.filters.member }), DEVI.id);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ member: DEVI.id, page: 1 }));
  });

  // The same `onChange` the desktop bar reports to, so the same URL is written and a filtered view
  // stays linkable whichever width it was filtered at (filters.ts is the one model).
  it("reports a change through the same filter model the desktop bar uses", async () => {
    const onChange = bar({ ...defaultAuditFilters(ENVIRONMENT), page: 3 });
    await userEvent.click(screen.getByRole("button", { name: m.filters.phoneTrigger }));
    const sheet = await screen.findByRole("dialog", { name: m.filters.phoneTrigger });
    await userEvent.selectOptions(within(sheet).getByRole("combobox", { name: m.filters.result }), "refused");
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ result: "refused", page: 1 }));
  });

  // :79-84 -- `tabs tabs-lg`, so every tab is 44px and they share the row's width. Kept as
  // `aria-pressed` buttons in a `role="group"`, which is what both sheets draw and what a tablist
  // would wrongly promise a tabpanel underneath.
  it("gives every date tab a 44px target on a phone", () => {
    bar();
    const group = screen.getByRole("group", { name: m.filters.rangeLabel });
    for (const tab of within(group).getAllByRole("button")) {
      expect(tab.className, tab.textContent ?? "").toContain("max-sm:h-11");
      expect(tab).toHaveAttribute("aria-pressed");
    }
  });
});

/**
 * A rotate, or a window dragged wider, while the phone's filter dialog is open.
 *
 * Everything else on this page picks its layout in CSS and needs no width read at all. This one
 * cannot: closing a modal is behaviour, not layout, and no stylesheet can do it. Left open past sm
 * the dialog is a phone sheet sitting on a desktop-width page, over a bar that is now drawing the
 * very same search box and the very same four pickers behind it -- two live copies of one control,
 * and the modal traps focus in the copy the member cannot see the page around.
 *
 * The listener is the whole mechanism: the trigger is `sm:hidden`, so the dialog can never be
 * *opened* while wide, and nothing needs to be read on mount.
 */
describe("the filters dialog when the viewport crosses sm", () => {
  const real = Object.getOwnPropertyDescriptor(window, "matchMedia");

  /** A matchMedia that starts narrow and can be told, once, that the page is now wide. */
  function widenLater(): () => void {
    const listeners: ((event: MediaQueryListEvent) => void)[] = [];
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) => void listeners.push(fn),
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
    return () => {
      for (const fn of listeners) fn({ matches: true } as MediaQueryListEvent);
    };
  }

  afterEach(() => {
    // Restored by hand: tests/setup.ts only installs its stub when there is none, so a fake left
    // behind here would quietly serve every later case in this file.
    if (real) Object.defineProperty(window, "matchMedia", real);
    else Reflect.deleteProperty(window, "matchMedia");
  });

  it("closes itself, rather than leaving a phone sheet over a desktop page", async () => {
    const widen = widenLater();
    bar();
    await userEvent.click(screen.getByRole("button", { name: m.filters.phoneTrigger }));
    expect(await screen.findByRole("dialog", { name: m.filters.phoneTrigger })).toBeInTheDocument();

    await act(async () => widen());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: m.filters.phoneTrigger })).toBeNull());
  });

  it("leaves it open while the page is still narrow", async () => {
    widenLater();
    bar();
    await userEvent.click(screen.getByRole("button", { name: m.filters.phoneTrigger }));
    expect(await screen.findByRole("dialog", { name: m.filters.phoneTrigger })).toBeInTheDocument();
  });
});
