import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RouteStrip } from "@/components/landing/journey/route-strip";

describe("RouteStrip", () => {
  it("is a named navigation of the page's stations, each a link to its section", () => {
    render(<RouteStrip />);
    const strip = screen.getByRole("navigation", { name: "Route through this page" });
    const links = within(strip).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["DEP", "GA", "01", "02", "03", "04", "05", "06", "07", "08", "END"]);
    expect(within(strip).getByRole("link", { name: "03 · The record you get" })).toHaveAttribute("href", "#record");
    expect(within(strip).getByRole("link", { name: "DEP · Platform 3 · Departures" })).toHaveAttribute("href", "#top");
  });

  it("carries the odometer, the station reading and the trains for the journey to show, all hidden from assistive tech", () => {
    const { container } = render(<RouteStrip />);
    expect(container.querySelector(".strip-odo")).toHaveTextContent("KM 000");
    expect(container.querySelector(".strip-odo")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".strip-now")).toHaveTextContent("DEP · Platform 3 · Departures");
    expect(container.querySelector(".strip-now")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll(".strip-train")).toHaveLength(2);
    expect(container.querySelector(".phone-rail")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("#route-strip .phone-rail")).toBeNull();
  });
});
