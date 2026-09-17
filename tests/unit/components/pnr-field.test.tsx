import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PnrField } from "@/components/pnr/pnr-field";

describe("PnrField", () => {
  it("exposes one numeric input with a label, a counter, and ten drawn cells", () => {
    const { container } = render(<PnrField id="pnr" digits="234" status="partial" sampleMode={false} onDigits={() => undefined} onEnter={() => undefined} />);
    const input = screen.getByLabelText("PNR number");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("id", "pnr");
    expect(input).toHaveAttribute("aria-describedby", "pnr-hint");
    expect(input).toHaveValue("234");
    expect(screen.getByText("3 / 10")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(10);
    expect(container.querySelectorAll("[data-filled]")).toHaveLength(3);
    expect(container.querySelector("[data-caret]")).toHaveAttribute("data-cell", "4");
    expect(screen.getByText("1–3")).toBeInTheDocument();
    expect(screen.getByText("7–10")).toBeInTheDocument();
  });

  it("strips non-digits and caps at ten before reporting", () => {
    const onDigits = vi.fn();
    render(<PnrField id="pnr" digits="" status="idle" sampleMode={false} onDigits={onDigits} onEnter={() => undefined} />);
    fireEvent.change(screen.getByLabelText("PNR number"), { target: { value: "23a4-567 89012" } });
    expect(onDigits).toHaveBeenCalledWith("2345678901");
  });

  it("runs on Enter whatever the state, so an early Enter still explains itself", () => {
    const onEnter = vi.fn();
    render(<PnrField id="pnr" digits="234" status="partial" sampleMode={false} onDigits={() => undefined} onEnter={onEnter} />);
    fireEvent.keyDown(screen.getByLabelText("PNR number"), { key: "Enter" });
    expect(onEnter).toHaveBeenCalledTimes(1);
  });

  it("marks invalid input and alerts with the drawn message", () => {
    render(<PnrField id="pnr" digits="234" status="invalid" sampleMode={false} onDigits={() => undefined} onEnter={() => undefined} />);
    expect(screen.getByLabelText("PNR number")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Enter all 10 digits.");
  });

  it("announces progress politely and hides the caret once ready", () => {
    const { container, rerender } = render(<PnrField id="pnr" digits="2345" status="partial" sampleMode={false} onDigits={() => undefined} onEnter={() => undefined} />);
    expect(screen.getByText("4 of 10 digits")).toHaveAttribute("aria-live", "polite");
    rerender(<PnrField id="pnr" digits="2345678901" status="ready" sampleMode={false} onDigits={() => undefined} onEnter={() => undefined} />);
    expect(container.querySelector("[data-caret]")).toBeNull();
  });
});
