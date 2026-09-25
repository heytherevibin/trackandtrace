import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouteStrip } from "@/components/landing/journey/route-strip";

describe("RouteStrip", () => {
  it("is a named navigation of the page's stations, each a link to its section", () => {
    render(<RouteStrip />);
    const strip = screen.getByRole("navigation", { name: "Route through this page" });
    const links = within(strip).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["DEP", "01", "02", "03", "04", "05", "06", "07", "08", "END"]);
    expect(within(strip).getByRole("link", { name: "03 · The record you get" })).toHaveAttribute("href", "#record");
    expect(within(strip).getByRole("link", { name: "Platform 3 · Departures" })).toHaveAttribute("href", "#top");
  });

  it("stands at DEP, kilometre zero, with the train drawn but hidden from assistive tech", () => {
    const { container } = render(<RouteStrip />);
    expect(screen.getByText("KM 000")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("DEP · Platform 3 · Departures")).toBeInTheDocument();
    expect(container.querySelector(".strip-train")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".strip-stops li:last-child")!.getAttribute("style")).toMatch(/left:\s*100(\.0+)?%/);
  });
});
