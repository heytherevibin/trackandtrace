import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineCard } from "@/console/leads/business-leads";
import { consoleMessages } from "@/console/messages";

// The Business pipeline board (sheet 22, part three): five columns, a card per lead, a Stage picker
// on each. Reading it writes nothing; moving a card is one request and no key.
const { push, refresh, requestMoveBusiness, success, error } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), requestMoveBusiness: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("@/console/leads/leads-client", () => ({ requestMoveBusiness }));
vi.mock("@/components/ui/toast", () => ({ notify: { success, error } }));

import { LeadsTabs } from "@/console/leads/leads-tabs";
import { PipelineBoard } from "@/console/leads/pipeline-board";

const b = consoleMessages.leads.business;
const p = b.board;
const NOW = "2026-09-19T09:02:00.000Z";
const card = (n: number, email: string, stage: PipelineCard["stage"], since: string, ownerName: string | null, about: string): PipelineCard => ({ id: `p:a${n}111111-1111-4111-8111-111111111111`, email, stage, stageSince: since, ownerName, about });
const CARDS: readonly PipelineCard[] = [
  card(1, "h•••@acme-travel.example", "new", "2026-09-17T05:50:00+00:00", "Kiran Das", "Travel desk, about 40 bookings a month"),
  card(2, "n•••@example.com", "new", "2026-09-19T03:00:00+00:00", null, "Bulk checks for a tour group of 60"),
  card(3, "v•••@example.in", "qualified", "2026-09-10T05:50:00+00:00", "Rohan Iyer", "Corporate travel team of 12"),
  card(4, "s•••@example.org", "lost", "2026-09-18T05:50:00+00:00", "Asha Rao", "Wanted a data feed; not offered"),
];
const column = (name: string) => screen.getByRole("region", { name });

beforeEach(() => {
  for (const fn of [push, refresh, requestMoveBusiness, success, error]) fn.mockReset();
});

describe("the board", () => {
  it("draws the five stages in order, each with how many leads are in it", () => {
    render(<PipelineBoard cards={CARDS} now={NOW} />);
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toEqual(["New", "Contacted", "Qualified", "Won", "Lost"]);
    expect(within(column("New")).getByText("2")).toBeInTheDocument();
    expect(within(column("Qualified")).getByText("1")).toBeInTheDocument();
    expect(within(column("Won")).getByText("0")).toBeInTheDocument();
  });

  it("draws a card in its stage: the masked address opening its record, the line about it, its owner and its time there", () => {
    render(<PipelineBoard cards={CARDS} now={NOW} />);
    const cards = within(column("New")).getAllByRole("article");
    expect(cards).toHaveLength(2);
    const first = within(cards[0]!);
    expect(first.getByRole("link", { name: consoleMessages.leads.table.open("h•••@acme-travel.example") })).toHaveAttribute("href", `/leads/pipeline?lead=${encodeURIComponent(CARDS[0]!.id)}`);
    expect(first.getByText("Travel desk, about 40 bookings a month")).toBeInTheDocument();
    expect(first.getByText("KD")).toHaveAttribute("title", "Kiran Das");
    expect(first.getByText("2 days in stage")).toBeInTheDocument();
    const second = within(cards[1]!);
    expect(second.getByText(p.today)).toBeInTheDocument();
    // Owned by nobody: said, not left blank.
    expect(second.getByTitle(b.nobody)).toBeInTheDocument();
    expect(within(column("Lost")).getByText("1 day in stage")).toBeInTheDocument();
  });

  it("draws an empty stage as an empty stage, not as nothing", () => {
    render(<PipelineBoard cards={CARDS} now={NOW} />);
    for (const name of ["Contacted", "Won"]) {
      expect(within(column(name)).getByText(p.empty)).toBeInTheDocument();
      expect(within(column(name)).queryByRole("article")).not.toBeInTheDocument();
    }
    expect(within(column("New")).queryByText(p.empty)).not.toBeInTheDocument();
  });

  it("moves a card with its Stage picker, and re-reads the board", async () => {
    requestMoveBusiness.mockResolvedValue({ kind: "done", business: {} });
    render(<PipelineBoard cards={CARDS} now={NOW} />);
    const picker = within(column("New")).getByRole("combobox", { name: p.stageOf("h•••@acme-travel.example") });
    expect(picker).toHaveValue("new");
    await userEvent.selectOptions(picker, "contacted");
    expect(requestMoveBusiness).toHaveBeenCalledWith(CARDS[0]!.id, "contacted");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(error).not.toHaveBeenCalled();
  });

  it("says why a move was refused, and re-reads the board all the same", async () => {
    requestMoveBusiness.mockResolvedValue({ kind: "failed", message: b.errors.notIn });
    render(<PipelineBoard cards={CARDS} now={NOW} />);
    await userEvent.selectOptions(within(column("Lost")).getByRole("combobox"), "won");
    await waitFor(() => expect(error).toHaveBeenCalledWith(b.errors.notIn));
    expect(refresh).toHaveBeenCalled();
  });

  it("says there are no business leads yet, and that the board could not be read, as two different things", async () => {
    const none = render(<PipelineBoard cards={[]} now={NOW} />);
    expect(screen.getByText(p.noneTitle)).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    none.unmount();
    render(<PipelineBoard cards={null} now={NOW} />);
    expect(screen.getByRole("alert")).toHaveTextContent(p.unavailableTitle);
    expect(screen.queryByText(p.noneTitle)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: p.retry }));
    expect(refresh).toHaveBeenCalled();
  });
});

describe("the tabs", () => {
  it("are two links, and say which page this is", () => {
    render(<LeadsTabs current="pipeline" />);
    const tabs = screen.getByRole("navigation", { name: b.tabs.label });
    expect(within(tabs).getByRole("link", { name: b.tabs.lifecycle })).toHaveAttribute("href", "/leads");
    expect(within(tabs).getByRole("link", { name: b.tabs.lifecycle })).not.toHaveAttribute("aria-current");
    expect(within(tabs).getByRole("link", { name: b.tabs.pipeline })).toHaveAttribute("href", "/leads/pipeline");
    expect(within(tabs).getByRole("link", { name: b.tabs.pipeline })).toHaveAttribute("aria-current", "page");
  });
});
