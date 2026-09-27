import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DepartureBoard } from "@/components/landing/journey/departure-board";
import { HeroDial } from "@/components/landing/journey/hero-dial";

describe("DepartureBoard", () => {
  it("lists the page's sections as departures, each a link, with its kilometre post", () => {
    render(<DepartureBoard />);
    const board = screen.getByRole("region", { name: "Departures · Platform 3" });
    const table = within(board).getByRole("table", { name: "The sections of this page, listed as departures" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(10);
    expect(within(rows[0]!).getByRole("link", { name: "The train, drawn" })).toHaveAttribute("href", "#anatomy");
    expect(within(rows[0]!).getByText("012")).toBeInTheDocument();
    expect(within(rows[1]!).getByRole("link", { name: "Operating principles" })).toHaveAttribute("href", "#principles");
    expect(within(rows[1]!).getByText("064")).toBeInTheDocument();
    expect(within(rows.at(-1)!).getByRole("link", { name: "Run a check" })).toHaveAttribute("href", "#terminus");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Stn", "Destination", "Km", "Status"]);
  });

  it("carries a status column for the journey to fill, one row per stop", () => {
    const { container } = render(<DepartureBoard />);
    expect(screen.getByRole("columnheader", { name: "Status" })).toBeInTheDocument();
    const rows = container.querySelectorAll("tbody tr");
    expect([...rows].map((r) => r.getAttribute("data-stop"))).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    for (const row of rows) expect(row.querySelector("td.board-status")).toHaveTextContent("");
  });
});

describe("HeroDial", () => {
  it("is decoration: ten digit segments in three labelled groups, none lit, hidden from assistive tech", () => {
    const { container } = render(<HeroDial />);
    const dial = container.querySelector(".hero-dial")!;
    expect(dial).toHaveAttribute("aria-hidden", "true");
    expect(dial.querySelectorAll(".dial-seg")).toHaveLength(10);
    expect(dial.querySelectorAll(".dial-seg.is-on")).toHaveLength(0);
    expect(dial.querySelectorAll(".dial-tick")).toHaveLength(120);
    expect([...dial.querySelectorAll(".dial-label")].map((t) => t.textContent)).toEqual(["1–3", "4–6", "7–10"]);
  });
});
