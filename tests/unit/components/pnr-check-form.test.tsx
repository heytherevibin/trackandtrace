import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));

const { PnrCheckForm } = await import("@/components/pnr/pnr-check-form");

describe("PnrCheckForm", () => {
  it("refuses an incomplete PNR with an alert and no navigation", () => {
    render(<PnrCheckForm />);
    fireEvent.change(screen.getByLabelText("PNR number"), { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter all 10 digits.");
    expect(push).not.toHaveBeenCalled();
  });

  it("navigates to the result for a valid PNR and shows the running state", () => {
    render(<PnrCheckForm />);
    fireEvent.change(screen.getByLabelText("PNR number"), { target: { value: "2345678901" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(push).toHaveBeenCalledWith("/pnr/2345678901");
    expect(screen.getByRole("button", { name: "Run" })).toHaveAttribute("aria-busy", "true");
  });
});
