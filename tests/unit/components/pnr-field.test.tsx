import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PnrField } from "@/components/pnr/pnr-field";

describe("PnrField", () => {
  it("exposes one numeric input with a label and ten presentational keys", () => {
    const { container } = render(<PnrField value="234" onChange={() => undefined} status="partial" id="pnr" />);
    const input = screen.getByLabelText("PNR number");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("id", "pnr");
    expect(input).toHaveValue("234");
    expect(container.querySelectorAll("[data-key]")).toHaveLength(10);
    expect(container.querySelectorAll("[data-armed]")).toHaveLength(3);
  });

  it("strips non-digits and caps at ten before calling onChange", () => {
    const onChange = vi.fn();
    render(<PnrField value="" onChange={onChange} status="idle" />);
    fireEvent.change(screen.getByLabelText("PNR number"), { target: { value: "23a4-567 89012" } });
    expect(onChange).toHaveBeenCalledWith("2345678901");
  });

  it("submits on Enter only when ready", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<PnrField value="234" onChange={() => undefined} onSubmit={onSubmit} status="partial" />);
    fireEvent.keyDown(screen.getByLabelText("PNR number"), { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
    rerender(<PnrField value="2345678901" onChange={() => undefined} onSubmit={onSubmit} status="ready" />);
    fireEvent.keyDown(screen.getByLabelText("PNR number"), { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("marks invalid input and alerts with the message", () => {
    render(<PnrField value="234" onChange={() => undefined} status="invalid" errorMessage="Enter all 10 digits." />);
    expect(screen.getByLabelText("PNR number")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter all 10 digits.");
  });

  it("shows the progress hint and the readout echo", () => {
    render(<PnrField value="2345" onChange={() => undefined} status="partial" />);
    expect(screen.getByText("4 of 10 digits")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "PNR readout showing 234 5" })).toBeInTheDocument();
  });
});
