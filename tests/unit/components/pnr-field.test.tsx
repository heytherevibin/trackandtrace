import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PnrField } from "@/components/pnr/pnr-field";

/** Fires a paste carrying `text`, as the browser does before inserting anything. */
function paste(target: HTMLElement, text: string): Event {
  const event = createEvent.paste(target, { clipboardData: { getData: (type: string) => (type === "text" || type === "text/plain" ? text : "") } });
  fireEvent(target, event);
  return event;
}

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

  it.each([
    ["a bare PNR", "2345678900"],
    ["a PNR copied from the booking SMS", "PNR:2345678900,TRN:12951,DOJ:17-09-26"],
    ["a PNR grouped with hyphens", "PNR No. 234-567-8900"],
  ])("pastes %s whole, replacing what was typed", (_label, text) => {
    const onDigits = vi.fn();
    render(<PnrField id="pnr" digits="98" status="partial" sampleMode={false} onDigits={onDigits} onEnter={() => undefined} />);
    const event = paste(screen.getByLabelText("PNR number"), text);
    expect(onDigits).toHaveBeenCalledWith("2345678900");
    expect(event.defaultPrevented).toBe(true);
  });

  it("adds pasted digits after the ones typed when the paste holds no whole PNR, capped at ten", () => {
    const onDigits = vi.fn();
    render(<PnrField id="pnr" digits="2345" status="partial" sampleMode={false} onDigits={onDigits} onEnter={() => undefined} />);
    paste(screen.getByLabelText("PNR number"), "678-90123");
    expect(onDigits).toHaveBeenCalledWith("2345678901");
  });

  it("ignores a paste with no digits and never truncates by character count", () => {
    const onDigits = vi.fn();
    render(<PnrField id="pnr" digits="23" status="partial" sampleMode={false} onDigits={onDigits} onEnter={() => undefined} />);
    paste(screen.getByLabelText("PNR number"), "hello");
    expect(onDigits).not.toHaveBeenCalled();
    expect(screen.getByLabelText("PNR number")).not.toHaveAttribute("maxlength");
  });

  it("takes no paste while the check is running", () => {
    const onDigits = vi.fn();
    render(<PnrField id="pnr" digits="2345678901" status="running" sampleMode={false} onDigits={onDigits} onEnter={() => undefined} />);
    paste(screen.getByLabelText("PNR number"), "9876543210");
    expect(onDigits).not.toHaveBeenCalled();
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
