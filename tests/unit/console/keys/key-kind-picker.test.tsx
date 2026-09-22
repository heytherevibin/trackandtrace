import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { KeyKindPicker } from "@/console/keys/key-kind-picker";
import type { ConsoleKeyKind } from "@/console/keys/kind";

function Harness({ onChange }: { readonly onChange?: (kind: ConsoleKeyKind) => void }) {
  const [kind, setKind] = useState<ConsoleKeyKind | null>(null);
  return (
    <>
      <span id="legend">What kind of key?</span>
      <KeyKindPicker
        value={kind}
        labelId="legend"
        disabled={false}
        onChange={(next) => {
          setKind(next);
          onChange?.(next);
        }}
      />
    </>
  );
}

describe("KeyKindPicker", () => {
  it("offers exactly the two kinds the console knows, in the sheets' own words", () => {
    render(<KeyKindPicker value={null} labelId="legend" disabled={false} onChange={vi.fn()} />);
    const choices = screen.getAllByRole("radio");
    expect(choices).toHaveLength(2);
    expect(choices[0]).toHaveAccessibleName(/Security key/);
    expect(choices[1]).toHaveAccessibleName(/This device/);
  });

  // The shipped defect is that the browser chose for the member. A default here would be the
  // console choosing instead: whichever one it picked would re-create the wall for the members who
  // wanted the other. Same reading change-role-dialog.tsx settled for its own undrawn picker.
  it("starts with nothing chosen", () => {
    render(<KeyKindPicker value={null} labelId="legend" disabled={false} onChange={vi.fn()} />);
    for (const choice of screen.getAllByRole("radio")) expect(choice).toHaveAttribute("aria-checked", "false");
  });

  it("reports the kind the member picked", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: /Security key/ }));
    expect(onChange).toHaveBeenCalledWith("securityKey");
    expect(screen.getByRole("radio", { name: /Security key/ })).toHaveAttribute("aria-checked", "true");
  });

  it("reports the other one too", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: /This device/ }));
    expect(onChange).toHaveBeenCalledWith("thisDevice");
  });

  it("moves between the two with the arrow keys, the way a radiogroup must", async () => {
    render(<Harness />);
    await userEvent.tab();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: /Security key/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: /This device/ })).toHaveAttribute("aria-checked", "true");
  });

  it("is one tab stop, not two", async () => {
    render(<Harness />);
    const choices = screen.getAllByRole("radio");
    expect(choices[0]).toHaveAttribute("tabindex", "0");
    expect(choices[1]).toHaveAttribute("tabindex", "-1");
    await userEvent.click(screen.getByRole("radio", { name: /This device/ }));
    expect(screen.getAllByRole("radio")[0]).toHaveAttribute("tabindex", "-1");
    expect(screen.getAllByRole("radio")[1]).toHaveAttribute("tabindex", "0");
  });

  it("cannot be changed while a ceremony is already running", async () => {
    const onChange = vi.fn();
    render(<KeyKindPicker value="securityKey" labelId="legend" disabled onChange={onChange} />);
    await userEvent.click(screen.getByRole("radio", { name: /This device/ }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
