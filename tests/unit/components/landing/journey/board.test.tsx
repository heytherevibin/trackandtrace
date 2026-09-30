import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { flapChars, readsAs, startBoard, unflap } from "@/components/landing/journey/board";
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

// A flip turns each character on its own axis, one inline-block span per character. A span holding an ordinary space
// collapses to nothing, so mid-flip "The train, drawn" ran together as "THETRAIN,DRAWN": a space turns as a
// non-breaking one. The flip is presentational: the accessible name, and the settled text, keep ordinary spaces.
describe("the board's flap characters", () => {
  const cell = () => document.createElement("span");

  it("turn a space as a non-breaking space, so it never collapses mid-flip", () => {
    const el = cell();
    const chars = flapChars(el, "The train, drawn");
    expect(chars.map((c) => c.textContent).join("")).toBe("The\u00a0train,\u00a0drawn");
    expect(chars[3]!.textContent).toBe("\u00a0");
    expect(chars.every((c) => c.getAttribute("aria-hidden") === "true")).toBe(true);
  });

  it("name the flipping words with ordinary spaces, for assistive tech", () => {
    const el = cell();
    flapChars(el, "At platform");
    expect(el.getAttribute("aria-label")).toBe("At platform");
  });

  it("read as the words they stand for, non-breaking spaces as ordinary ones, and not as other words", () => {
    const el = cell();
    flapChars(el, "The record you get");
    expect(readsAs(el, "The record you get")).toBe(true);
    expect(readsAs(el, "The record you got")).toBe(false);
    const plain = cell();
    plain.textContent = "The record you get";
    expect(readsAs(plain, "The record you get")).toBe(false); // nothing flipping: nothing to settle
  });

  it("settle back to the plain words, ordinary spaces and no stand-in name", () => {
    const el = cell();
    flapChars(el, "More than a check");
    unflap(el, "More than a check");
    expect(el.textContent).toBe("More than a check");
    expect(el.textContent).not.toContain("\u00a0");
    expect(el.children).toHaveLength(0);
    expect(el.hasAttribute("aria-label")).toBe(false);
  });
});
