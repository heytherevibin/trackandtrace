import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Roadmap } from "@/components/landing/roadmap";
import { messages } from "@/messages";

// The roadmap makes a public claim about what exists. Before this test every row carried one
// hard-coded "Planned" chip, which told a reader that seat availability was still to come while
// they could go and use it on /pre-booking. What each row says is now pinned here, because the
// page is the wrong place to discover that a claim went stale.

const m = messages.home.roadmap;
const rows = () => screen.getAllByRole("listitem");

describe("the roadmap's per-item status", () => {
  it("gives every row a status drawn from the status map", () => {
    render(<Roadmap />);
    const said = rows().map((row) => within(row).getByText(new RegExp(`^(${Object.values(m.status).join("|")})$`)).textContent);
    expect(said).toHaveLength(m.items.length);
  });

  it("says Live for what has shipped and Planned for what has not", () => {
    // 03 seat availability is served by /api/route-availability and drawn on /pre-booking; 05 fare
    // enquiry ships inside it, since the plate renders a fare per class and date. The other five
    // have no service behind them.
    render(<Roadmap />);
    const byNum = Object.fromEntries(
      rows().map((row) => {
        const num = within(row).getByText(/^\d\d$/).textContent ?? "";
        const status = within(row).getByText(new RegExp(`^(${Object.values(m.status).join("|")})$`)).textContent ?? "";
        return [num, status];
      }),
    );
    expect(byNum).toEqual({
      "01": m.status.planned,
      "02": m.status.planned,
      "03": m.status.live,
      "04": m.status.planned,
      "05": m.status.live,
      "06": m.status.planned,
      "07": m.status.planned,
    });
  });

  it("marks a shipped row differently from a planned one, not only in words", () => {
    // A reader skimming the column should see the difference without reading each chip.
    render(<Roadmap />);
    const live = within(rows()[2] as HTMLElement).getByText(m.status.live);
    const planned = within(rows()[0] as HTMLElement).getByText(m.status.planned);
    expect(live.className).not.toBe(planned.className);
  });

  it("keeps every item's status a key the status map defines", () => {
    // A typo'd status would otherwise render `undefined` on a public page.
    for (const item of m.items) expect(Object.keys(m.status)).toContain(item.status);
  });
});
