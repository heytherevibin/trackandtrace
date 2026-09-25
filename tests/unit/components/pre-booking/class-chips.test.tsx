import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClassChips } from "@/components/pre-booking/class-chips";

// Classes are a multiple choice, so they are toggles and not a select: a select shows one answer
// and this question has several.
//
// The rule worth pinning is the ORDER. What comes back is always the enum's order, never the order
// they were clicked, because the first of them is the class the whole list will lead with — and two
// readers who picked the same three must see the same column.

const noop = () => undefined;

describe("choosing classes", () => {
  it("is a group of toggles, one per class", () => {
    render(<ClassChips value={["SL", "3A", "2A"]} onChange={noop} labelledBy="cls" />);
    expect(screen.getByRole("group")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(7);
    expect(screen.getByRole("button", { name: "SL" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1A" })).toHaveAttribute("aria-pressed", "false");
  });

  it("names each class in full for anyone who does not know the code", () => {
    render(<ClassChips value={["SL"]} onChange={noop} labelledBy="cls" />);
    expect(screen.getByRole("button", { name: "SL" })).toHaveAccessibleDescription("Sleeper");
  });

  it("answers in the enum's order however the reader clicks", () => {
    const onChange = vi.fn();
    render(<ClassChips value={["SL"]} onChange={onChange} labelledBy="cls" />);
    fireEvent.click(screen.getByRole("button", { name: "2A" }));
    // 2A leads because the enum declares it before SL, not because it was clicked second.
    expect(onChange).toHaveBeenCalledWith(["2A", "SL"]);
  });

  it("turns a chosen class off", () => {
    const onChange = vi.fn();
    render(<ClassChips value={["SL", "3A"]} onChange={onChange} labelledBy="cls" />);
    fireEvent.click(screen.getByRole("button", { name: "3A" }));
    expect(onChange).toHaveBeenCalledWith(["SL"]);
  });

  it("will not let the last class be turned off", () => {
    const onChange = vi.fn();
    render(<ClassChips value={["SL"]} onChange={onChange} labelledBy="cls" />);
    fireEvent.click(screen.getByRole("button", { name: "SL" }));
    // No class is not a question anyone can answer, and the alternative — silently picking one
    // back — would spend a request on a berth nobody asked about.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "SL" })).toHaveAttribute("aria-pressed", "true");
  });

  it("says which one the list will lead with", () => {
    render(<ClassChips value={["SL", "3A", "2A"]} onChange={noop} labelledBy="cls" />);
    // Invisible otherwise: every row carries 2A and the reader picked three, so the page says so
    // rather than letting the column look arbitrary.
    expect(screen.getByText("2A first")).toBeInTheDocument();
  });
});
