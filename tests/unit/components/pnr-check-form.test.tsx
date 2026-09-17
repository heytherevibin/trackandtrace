import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { recentStore } from "@/services/stores/recent-store";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));

const { PnrCheckForm } = await import("@/components/pnr/pnr-check-form");

beforeEach(() => {
  push.mockReset();
  recentStore.clear();
});

describe("PnrCheckForm", () => {
  it("draws the same entry block and stub as the terminal", () => {
    const { container } = render(<PnrCheckForm id="pnr-notfound" />);
    expect(screen.getByLabelText("PNR number")).toHaveAttribute("id", "pnr-notfound");
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(10);
    expect(screen.getByText("Standing by")).toBeInTheDocument();
    expect(screen.getByText("The 10 digits printed top-left on your ticket, or in your booking SMS.")).toBeInTheDocument();
  });

  it("refuses an incomplete PNR with an alert and no navigation", () => {
    render(<PnrCheckForm />);
    fireEvent.change(screen.getByLabelText("PNR number"), { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter all 10 digits.");
    expect(push).not.toHaveBeenCalled();
  });

  it("records the check and navigates to the full record", () => {
    render(<PnrCheckForm />);
    fireEvent.change(screen.getByLabelText("PNR number"), { target: { value: "2345678901" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(push).toHaveBeenCalledWith("/pnr/2345678901");
    expect(screen.getByRole("button", { name: "Running…" })).toBeInTheDocument();
    expect(screen.getByText("Requesting source")).toBeInTheDocument();
    expect(recentStore.get()[0]).toMatchObject({ pnr: "2345678901" });
  });
});
