import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

const { CheckAgainSheet } = await import("@/components/pnr/result-check-again");
const { ErrorSheet } = await import("@/components/pnr/result-error-sheet");
const { UnavailableLifecycle } = await import("@/components/pnr/result-lifecycle");

describe("CheckAgainSheet", () => {
  it("puts the title block beside the live check terminal plate with its form number", () => {
    render(<CheckAgainSheet title="That is not a PNR" detail="A PNR is ten digits. Enter the number from your ticket." />);
    expect(screen.getByRole("heading", { level: 1, name: "That is not a PNR" })).toBeInTheDocument();
    const terminal = screen.getByText("PNR check — live request").closest(".blueprint");
    expect(terminal).not.toBeNull();
    expect(within(terminal as HTMLElement).getByText("Form TL-01")).toBeInTheDocument();
    expect(within(terminal as HTMLElement).getByLabelText("PNR number")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Watchlist" })).toHaveAttribute("href", "/watchlist");
  });
});

describe("ErrorSheet", () => {
  it("titles the page, then states the failure in an alert plate with the reference and a retry", () => {
    const onRetry = vi.fn();
    render(<ErrorSheet digest="abc123" onRetry={onRetry} />);
    expect(screen.getByRole("heading", { level: 1, name: "Something broke on our side" })).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(within(alert).getByRole("heading", { level: 2, name: "This page did not load" })).toBeInTheDocument();
    expect(within(alert).getByText("Reference abc123")).toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("UnavailableLifecycle", () => {
  it("draws the request lifecycle stopping at the source, with nothing presented", () => {
    render(<UnavailableLifecycle pnr="2345678901" />);
    const region = screen.getByRole("region", { name: "PNR request lifecycle" });
    const steps = within(region).getAllByRole("listitem");
    expect(steps.map((li) => li.getAttribute("data-state"))).toEqual(["done", "done", "pending", "pending"]);
    expect(steps[2]).toHaveTextContent("No verified source answered");
    expect(steps[3]).toHaveTextContent("Unavailable until a source answers");
  });
});
