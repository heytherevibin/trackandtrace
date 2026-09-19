import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AccuracyPage from "@/app/accuracy/page";

describe("AccuracyPage", () => {
  it("opens with the drawn title block", () => {
    render(<AccuracyPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Accuracy and data policy" })).toBeInTheDocument();
    expect(screen.getByText("No accuracy figure is published until verified responses and confirmed outcomes exist and can be audited.")).toBeInTheDocument();
  });

  it("states that reporting is unavailable and that every count is zero", () => {
    render(<AccuracyPage />);
    const heading = screen.getByRole("heading", { level: 2, name: "Accuracy reporting is not available yet" });
    const plate = heading.closest("[role=status]") as HTMLElement;
    expect(plate).not.toBeNull();
    expect(plate).toHaveClass("blueprint");
    expect(within(plate).getByText("There are no verified predictions and no confirmed outcomes to compare, so nothing is estimated.")).toBeInTheDocument();
    const facts = [...plate.querySelectorAll("dt")].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(facts).toEqual([
      ["Verified records", "0"],
      ["Confirmed outcomes", "0"],
      ["Figures estimated", "0"],
    ]);
  });

  it("numbers its sections and puts the service status, with nothing internal, in the first", () => {
    render(<AccuracyPage />);
    const service = screen.getByRole("heading", { level: 2, name: "01 · Service" });
    const section = service.closest("section") as HTMLElement;
    const list = within(section).getByRole("list", { name: "Service status" });
    expect(within(list).getByText("PNR checks")).toBeInTheDocument();
    expect(within(list).getByText("Accounts and watchlist sync")).toBeInTheDocument();
    expect(section.textContent).not.toMatch(/timetable|inventory|flags|railkit|rapid|fallback/i);
    expect(screen.getByRole("heading", { level: 2, name: "02 · What would have to exist first" })).toBeInTheDocument();
  });

  it("lists the three things that would have to exist first", () => {
    render(<AccuracyPage />);
    const section = screen.getByRole("heading", { name: "02 · What would have to exist first" }).closest("section") as HTMLElement;
    const rows = [...section.querySelectorAll("dt")].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]);
    expect(rows).toEqual([
      ["Live response", "A verified reservation responseEach record must come from a railway data source with its name and retrieval time attached."],
      ["Observed outcome", "The final status at chart timeThe confirmed, RAC, or waitlisted outcome after the chart is prepared, recorded from the same source."],
      ["Audit record", "Both, stored side by sideOnly when responses and outcomes exist together can an accuracy figure be computed and checked by anyone."],
    ]);
  });

  it("frames the status, the service list, and the evidence as marked plates", () => {
    const { container } = render(<AccuracyPage />);
    const plates = [...container.querySelectorAll(".blueprint")];
    expect(plates).toHaveLength(3);
    for (const plate of plates) expect(plate.querySelectorAll(":scope > .corner")).toHaveLength(4);
  });
});
