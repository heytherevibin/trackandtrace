import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PhoneRail, RouteStrip } from "@/components/landing/journey/route-strip";

describe("RouteStrip", () => {
  it("is a named navigation of the page's stations, each a link to its section", () => {
    render(<RouteStrip />);
    const strip = screen.getByRole("navigation", { name: "Route through this page" });
    const links = within(strip).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["DEP", "GA", "01", "02", "03", "04", "05", "06", "07", "08", "END"]);
    expect(within(strip).getByRole("link", { name: "03 · The record you get" })).toHaveAttribute("href", "#record");
    expect(within(strip).getByRole("link", { name: "DEP · Platform 3 · Departures" })).toHaveAttribute("href", "#top");
  });

  it("stands its stops down the rail's height, top to bottom in the route's order", () => {
    const { container } = render(<RouteStrip />);
    const stops = [...container.querySelectorAll<HTMLLIElement>(".strip-stops li")];
    expect(stops).toHaveLength(11);
    expect(stops[0]!.style.top).toBe("calc((100% - var(--stop-h)) * 0.0000)");
    expect(stops[5]!.style.top).toBe("calc((100% - var(--stop-h)) * 0.5000)");
    expect(stops[10]!.style.top).toBe("calc((100% - var(--stop-h)) * 1.0000)");
    for (const stop of stops) expect(stop.style.left).toBe("");
  });

  it("carries the odometer and one train for the journey to show, hidden from assistive tech, and no spelled-out station", () => {
    const { container } = render(<RouteStrip />);
    expect(container.querySelector(".strip-odo")).toHaveTextContent("KM 000");
    expect(container.querySelector(".strip-odo")).toHaveAttribute("aria-hidden", "true");
    // The highlighted stop names the current station; nothing spells it out beside the rail.
    expect(container.querySelector(".strip-now")).toBeNull();
    expect(container.querySelectorAll(".strip-train")).toHaveLength(1);
    expect(container.querySelector(".strip-train")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".phone-rail")).toBeNull();
  });
});

describe("PhoneRail", () => {
  it("is a hairline rail carrying the train alone, hidden from assistive tech", () => {
    const { container } = render(<PhoneRail />);
    const rail = container.querySelector(".phone-rail");
    expect(rail).toHaveAttribute("aria-hidden", "true");
    expect(rail!.querySelectorAll(".strip-train")).toHaveLength(1);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
