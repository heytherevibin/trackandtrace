import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChoiceList, type Choice } from "@/components/ui/choice-list";

// The radiogroup RolePicker was, lifted out so the composer's List picker is the same control.
// One addition: a disabled choice (ConsoleAnnouncements.dc.html draws the spent Availability list
// `aria-disabled`, out of the tab order, and it must not be reachable by arrow keys either).
const CHOICES: readonly Choice<"news" | "availability" | "other">[] = [
  { value: "news", label: "News", description: "431 people confirmed." },
  { value: "availability", label: "Availability", description: "Spent.", disabled: true },
  { value: "other", label: "Other", description: "For the arrow keys." },
];

function setup(value: "news" | "availability" | "other" | null = "news") {
  const onChange = vi.fn();
  render(
    <>
      <span id="lbl">List</span>
      <ChoiceList value={value} choices={CHOICES} labelId="lbl" onChange={onChange} />
    </>,
  );
  return onChange;
}

describe("ChoiceList", () => {
  it("is a labelled radiogroup with one checked radio in the tab order", () => {
    setup();
    expect(screen.getByRole("radiogroup", { name: "List" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /News/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /News/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: /Other/ })).toHaveAttribute("tabindex", "-1");
  });

  it("marks a disabled choice, keeps it out of the tab order, and ignores a click on it", async () => {
    const onChange = setup();
    const spent = screen.getByRole("radio", { name: /Availability/ });
    expect(spent).toHaveAttribute("aria-disabled", "true");
    expect(spent).toHaveAttribute("tabindex", "-1");
    await userEvent.click(spent);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("moves past a disabled choice with the arrow keys", async () => {
    const onChange = setup();
    screen.getByRole("radio", { name: /News/ }).focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(onChange).toHaveBeenCalledWith("other");
  });
});
