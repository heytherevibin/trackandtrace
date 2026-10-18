import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PnrFetchResult } from "@/services/pnr-source";
import { buildFixtureResult } from "@/services/sources/fixture";
import { RECENT_KEY, recentStore } from "@/services/stores/recent-store";

const fetchPnr = vi.fn<(pnr: string) => Promise<PnrFetchResult>>();
vi.mock("@/services/pnr-source", () => ({ fetchPnr: (pnr: string) => fetchPnr(pnr) }));

const { PnrTerminal } = await import("@/components/pnr/pnr-terminal");

const NOW = new Date("2026-09-17T06:30:00.000Z");

function fixture(pnr: string): PnrFetchResult {
  return { outcome: buildFixtureResult(pnr, NOW), cached: false, latencyMs: 4 };
}

async function settle(ms = 1_000): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  fetchPnr.mockReset();
  recentStore.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PnrTerminal", () => {
  it("draws the plate header, counter, ten cells, and the idle stub", () => {
    const { container } = render(<PnrTerminal sampleMode />);
    expect(screen.getByText("PNR check — live request")).toBeInTheDocument();
    expect(screen.getByText("Form TL-01")).toBeInTheDocument();
    expect(screen.getByText("0 / 10")).toBeInTheDocument();
    expect(container.querySelectorAll("[data-cell]")).toHaveLength(10);
    expect(screen.getByText("Standing by")).toBeInTheDocument();
    // v4: in sample mode the fixture's PNRs are their own row on the plate, and the hint stays the ticket's.
    expect(screen.getByText("The 10 digits printed top-left on your ticket, or in your booking SMS.")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Sample PNRs from the development fixture" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).not.toBeInTheDocument();
  });

  it("ends the idle hint after the SMS when the fixture is not serving", () => {
    render(<PnrTerminal sampleMode={false} />);
    expect(screen.getByText("The 10 digits printed top-left on your ticket, or in your booking SMS.")).toBeInTheDocument();
  });

  it("refuses an incomplete PNR with an alert, a shake, and no request", async () => {
    render(<PnrTerminal sampleMode={false} />);
    fireEvent.change(screen.getByLabelText("PNR number"), { target: { value: "12345" } });
    expect(screen.getByText("5 of 10 digits")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter all 10 digits.");
    expect(screen.getByText("Check the digits")).toBeInTheDocument();
    expect(screen.getByLabelText("PNR number")).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(screen.getByTestId("hero-instrument").className).toContain("shake"));
    expect(fetchPnr).not.toHaveBeenCalled();
  });

  it("runs the real request, holds the running state, then renders the record in place", async () => {
    fetchPnr.mockResolvedValue(fixture("2345678909"));
    render(<PnrTerminal sampleMode />);
    fireEvent.change(screen.getByLabelText("PNR number"), { target: { value: "234 567 8909" } });
    expect(screen.getByText("Ready to run")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Run" }));

    expect(screen.getByRole("button", { name: "Running…" })).toBeInTheDocument();
    expect(screen.getByText("Requesting source")).toBeInTheDocument();
    expect(screen.getByText("Running · validate → source → result")).toBeInTheDocument();
    expect(fetchPnr).toHaveBeenCalledWith("2345678909");

    await settle();
    expect(await screen.findByText("CNF · RAC · WL — party of three")).toBeInTheDocument();
    const result = screen.getByTestId("terminal-result");
    expect(within(result).getByText("Confirmed")).toBeInTheDocument();
    expect(within(result).getByText("Sample data")).toHaveAttribute("title", "Development fixture. Not a real reservation.");
    expect(screen.getByText("PNR 234 567 8909")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("RAC 4")).toBeInTheDocument();
    expect(within(table).getByText("WL 9")).toBeInTheDocument();
    expect(screen.getByText("SBC → NDLS")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open full record →" })).toHaveAttribute("href", "/pnr#2345678909");

    const stored = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]") as { pnr: string; status?: string }[];
    expect(stored[0]).toMatchObject({ pnr: "2345678909", status: "CNF" });
    expect(within(screen.getByTestId("recent-strip")).getByTestId("recent-item")).toHaveTextContent("234 567 8909");

    fireEvent.click(screen.getByRole("button", { name: "Check another PNR" }));
    // Back to an empty entry, the caret in it (the phone's pinned Run bar repeats the counter while it has focus).
    expect(screen.getByLabelText("PNR number")).toHaveValue("");
    expect(screen.getByLabelText("PNR number")).toHaveFocus();
  });

  it("draws v4's Next box and eight facts in place, and offers Save and Share", async () => {
    fetchPnr.mockResolvedValue(fixture("2345678905"));
    render(<PnrTerminal sampleMode />);
    fireEvent.change(screen.getByLabelText("PNR number"), { target: { value: "2345678905" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await settle();
    const result = await screen.findByTestId("terminal-result");
    expect(within(result).getByText(/^Save and re-check before \d\d:\d\d IST, when the first chart decides this ticket\.$/)).toBeInTheDocument();
    const terms = result.querySelectorAll("dl dt");
    expect([...terms].map((t) => t.textContent)).toEqual(["Train", "Route", "Journey", "Departs", "Class · quota", "Distance", "Chart", "Coach · berth"]);
    expect(within(result).getByRole("button", { name: "Save to watchlist" })).toBeInTheDocument();
    expect(within(result).getByRole("button", { name: "Share link" })).toBeInTheDocument();
  });

  it("runs a sample PNR at once from the sample row", async () => {
    fetchPnr.mockResolvedValue(fixture("2345678900"));
    render(<PnrTerminal sampleMode />);
    fireEvent.click(within(screen.getByTestId("sample-strip")).getByRole("button", { name: /No record/ }));
    await settle();
    expect(fetchPnr).toHaveBeenCalledWith("2345678900");
    const result = await screen.findByTestId("terminal-result");
    expect(within(result).getByText("No record")).toBeInTheDocument();
    expect(within(result).getByRole("button", { name: "Edit the digits" })).toBeInTheDocument();
  });

  it("offers no sample row outside sample mode", () => {
    render(<PnrTerminal sampleMode={false} />);
    expect(screen.queryByTestId("sample-strip")).not.toBeInTheDocument();
  });

  it("fails closed when the source is silent", async () => {
    fetchPnr.mockResolvedValue({ outcome: { ok: false, code: "SOURCE_UNAVAILABLE", message: "down" }, cached: false, latencyMs: 0 });
    render(<PnrTerminal sampleMode={false} />);
    fireEvent.change(screen.getByLabelText("PNR number"), { target: { value: "1234567890" } });
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await settle();
    expect(await screen.findByText("Source not connected")).toBeInTheDocument();
    expect(within(screen.getByTestId("terminal-result")).getByText("Source silent")).toBeInTheDocument();
    expect(screen.queryByText("Sample data")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open full record →" })).not.toBeInTheDocument();
    expect(screen.getByText(/^Attempted \d\d:\d\d IST · no verified source answered$/)).toBeInTheDocument();
  });

  it("puts a recent PNR back into the entry block and clears the device list", () => {
    recentStore.push({ pnr: "2345678903", status: "RAC", position: 1, checkedAt: NOW.toISOString() });
    render(<PnrTerminal sampleMode />);
    const strip = screen.getByTestId("recent-strip");
    expect(strip).toHaveAccessibleName("Recent checks on this device");
    expect(within(strip).getByText("Recent")).toBeInTheDocument();
    const chip = within(strip).getByTestId("recent-item");
    expect(chip).toHaveTextContent("234 567 8903");
    expect(chip).toHaveTextContent("RAC 1");
    fireEvent.click(chip);
    expect(screen.getByLabelText("PNR number")).toHaveValue("234 567 8903");
    expect(screen.getByText("10 / 10")).toBeInTheDocument();
    fireEvent.click(within(strip).getByRole("button", { name: "Clear" }));
    expect(screen.queryByTestId("recent-strip")).not.toBeInTheDocument();
  });
});
