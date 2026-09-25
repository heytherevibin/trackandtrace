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
    expect(within(strip).getByRole("link", { name: "DEP · Platform 3 · Departures" })).toHaveAttribute("href", "#top");
  });

  it("is only the rail and its stations: no odometer, no station reading, no train, until J3 moves it", () => {
    const { container } = render(<RouteStrip />);
    expect(screen.queryByText("KM 000")).toBeNull();
    expect(screen.queryByText("DEP · Platform 3 · Departures")).toBeNull();
    expect(container.querySelector(".strip-train")).toBeNull();
    expect(container.querySelector(".strip-stops li:last-child")!.getAttribute("style")).toMatch(/left:\s*100(\.0+)?%/);
  });
});
