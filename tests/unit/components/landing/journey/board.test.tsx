import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { startBoard } from "@/components/landing/journey/board";
import { DepartureBoard } from "@/components/landing/journey/departure-board";
import { STATION_EVENT, type StationDetail } from "@/components/landing/journey/journey-events";
import { testContext } from "./journey-context";

// Every build starts the board at station 0 and the strip then announces where the page really is. That first
// station is where the board already stood before the rebuild, so it is set, never flipped; only a station the
// reader then reaches flips its changed statuses in.

const station = (index: number) => window.dispatchEvent(new CustomEvent<StationDetail>(STATION_EVENT, { detail: { index } }));

describe("the departure board's statuses", () => {
  it("are set without a flip for a build's first station, and flip for the next", () => {
    const { container } = render(<DepartureBoard />);
    const cells = [...container.querySelectorAll<HTMLElement>("td.board-status")];
    const stop = startBoard(testContext());

    station(3);
    expect(cells.map((c) => c.querySelector(".flap-char"))).toEqual(cells.map(() => null));
    expect(cells.map((c) => c.textContent)).toEqual(["Departed", "Departed", "At platform", "Next", "", "", "", "", "", ""]);

    station(4);
    expect(cells[3]!.querySelector(".flap-char")).not.toBeNull();
    expect(cells[3]!.getAttribute("aria-label")).toBe("At platform");
    stop();
  });
});
