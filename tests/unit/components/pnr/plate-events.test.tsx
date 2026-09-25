import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PLATE_EVENT, type PlateDetail } from "@/components/landing/journey/journey-events";
import { PnrClosingTerminal, PnrTerminal } from "@/components/pnr/pnr-terminal";

function listen(): PlateDetail[] {
  const seen: PlateDetail[] = [];
  window.addEventListener(PLATE_EVENT, (e) => seen.push((e as CustomEvent<PlateDetail>).detail));
  return seen;
}

describe("the check plates tell the page what they hold", () => {
  it("the hero plate reports its digit count as it is typed", async () => {
    const seen = listen();
    render(<PnrTerminal sampleMode />);
    await userEvent.type(screen.getByRole("textbox"), "234");
    expect(seen.at(-1)).toEqual({ hero: true, digits: 3, running: false, done: false });
  });

  it("the closing plate reports as not the hero", async () => {
    const seen = listen();
    render(<PnrClosingTerminal sampleMode title="t" meta="m" lead="l" />);
    await userEvent.type(screen.getByRole("textbox"), "9");
    expect(seen.at(-1)).toEqual({ hero: false, digits: 1, running: false, done: false });
  });
});
