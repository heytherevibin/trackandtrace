import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryPoint, WatchlistEntry } from "@/types/domain";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }) }));
vi.mock("@/services/pnr-source", () => ({ fetchPnr: vi.fn() }));
vi.mock("@/services/watchlist-api", () => ({ saveWatchlist: vi.fn(), deleteWatchlist: vi.fn(), mergeWatchlist: vi.fn(), listWatchlist: vi.fn() }));

const { WatchlistView } = await import("@/app/watchlist/watchlist-view");
const { watchlistStore } = await import("@/services/stores/watchlist-store");
const { fetchPnr } = await import("@/services/pnr-source");
const api = await import("@/services/watchlist-api");
const { buildFixtureResult } = await import("@/services/sources/fixture");

const at = (hour: number): string => new Date(Date.UTC(2026, 8, 16, hour)).toISOString();
const point = (status: HistoryPoint["status"], position: number | null, hour: number): HistoryPoint => ({ at: at(hour), status, position });

const ENTRIES: readonly WatchlistEntry[] = [
  { pnr: "2345678909", label: "12627 · SBC→NDLS · party of 3", addedAt: at(0), checks: [point("CNF", null, 1), point("CNF", null, 2), point("CNF", null, 3)] },
  { pnr: "2345678905", label: "12627 · SBC→NDLS", addedAt: at(0), checks: [point("WL", 11, 1), point("WL", 8, 2), point("WL", 5, 3)] },
  { pnr: "2345678903", label: "12627 · SBC→NDLS", addedAt: at(0), checks: [point("RAC", 4, 1), point("RAC", 1, 2)] },
];

/** Seeds the device store through its own API, newest first as the store keeps them. */
function seed(entries: readonly WatchlistEntry[]): void {
  watchlistStore.clear();
  for (const entry of [...entries].reverse()) {
    const [first, ...rest] = entry.checks;
    watchlistStore.upsert(entry.pnr, entry.label, first);
    for (const p of rest) watchlistStore.appendCheck(entry.pnr, p);
  }
}

function view(props: Partial<Parameters<typeof WatchlistView>[0]> = {}) {
  return render(<WatchlistView signedIn={false} initialEntries={[]} loadError={false} sampleData={false} {...props} />);
}

beforeEach(() => {
  seed([]);
  vi.mocked(fetchPnr).mockReset();
  vi.mocked(api.saveWatchlist).mockReset();
  vi.mocked(api.deleteWatchlist).mockReset();
});

describe("WatchlistView — this device", () => {
  it("draws the sheet: title, lead, count, sync action, and one row per saved PNR", () => {
    seed(ENTRIES);
    view();
    expect(screen.getByRole("heading", { level: 1, name: "Watchlist" })).toBeInTheDocument();
    expect(screen.getByText("Saved on this device. Sign in to keep it across devices.")).toBeInTheDocument();
    expect(screen.getByText("3 saved")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in to sync" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("table", { name: "Saved PNRs — this device" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "234 567 8909" })).toHaveAttribute("href", "/pnr#2345678909");
    expect(screen.getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["PNR", "Journey", "Last status", "Checked", "Actions"]);
    expect(screen.getByText("Account sync")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all on this device" })).toBeInTheDocument();
  });

  it("shows the status tag, the real trend, and the check count", () => {
    seed(ENTRIES);
    view();
    const wlRow = screen.getByRole("link", { name: "234 567 8905" }).closest("tr")!;
    expect(within(wlRow).getByText("WL 5")).toBeInTheDocument();
    expect(within(wlRow).getByText("11 → 8 → 5")).toBeInTheDocument();
    expect(within(wlRow).getByText("3 checks")).toBeInTheDocument();
    const racRow = screen.getByRole("link", { name: "234 567 8903" }).closest("tr")!;
    expect(within(racRow).getByText("RAC 4 → RAC 1")).toBeInTheDocument();
    const cnfRow = screen.getByRole("link", { name: "234 567 8909" }).closest("tr")!;
    expect(within(cnfRow).getByText("Confirmed")).toBeInTheDocument();
    expect(within(cnfRow).queryByText(/ → /)).toBeNull();
  });

  it("labels sample data only when the development fixture is active", () => {
    seed(ENTRIES);
    const { unmount } = view({ sampleData: true });
    expect(screen.getByText("Sample data")).toHaveAttribute("title", "Development fixture. Not a real reservation.");
    unmount();
    view({ sampleData: false });
    expect(screen.queryByText("Sample data")).toBeNull();
  });

  it("removes a row and restores it with the single inline undo, history intact", () => {
    seed(ENTRIES);
    view();
    const row = screen.getByRole("link", { name: "234 567 8905" }).closest("tr")!;
    fireEvent.click(within(row).getByTestId("watchlist-remove"));
    expect(screen.queryByRole("link", { name: "234 567 8905" })).toBeNull();
    expect(screen.getByText("Removed 234 567 8905")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Undo/ })).toHaveLength(1);
    expect(watchlistStore.has("2345678905")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Undo remove" }));
    expect(screen.getByRole("link", { name: "234 567 8905" })).toBeInTheDocument();
    expect(screen.getByText("Restored")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Undo/ })).toBeNull();
    expect(watchlistStore.get().find((e) => e.pnr === "2345678905")?.checks).toHaveLength(3);
  });

  it("shows the empty plate, and offers undo there when the last entry was removed", () => {
    seed(ENTRIES.slice(0, 1));
    view();
    fireEvent.click(screen.getByTestId("watchlist-remove"));
    expect(screen.getByRole("heading", { level: 2, name: "Nothing saved yet" })).toBeInTheDocument();
    expect(screen.getByText("Run a check and save the PNR to follow it here.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Run a check" })).toHaveAttribute("href", "/#terminal");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear all on this device" })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Undo/ })).toHaveLength(1);
    expect(screen.getByText("0 saved")).toBeInTheDocument();
  });

  it("clears every entry on this device", () => {
    seed(ENTRIES);
    view();
    fireEvent.click(screen.getByRole("button", { name: "Clear all on this device" }));
    expect(screen.getByText("Cleared all on this device")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Nothing saved yet" })).toBeInTheDocument();
    expect(watchlistStore.get()).toHaveLength(0);
  });

  it("re-checks through the source and announces the real outcome", async () => {
    seed(ENTRIES);
    const outcome = buildFixtureResult("2345678905", new Date("2026-09-17T06:30:00.000Z"));
    let resolve: (value: Awaited<ReturnType<typeof fetchPnr>>) => void = () => undefined;
    vi.mocked(fetchPnr).mockReturnValue(new Promise((r) => (resolve = r)));
    view();
    const row = screen.getByRole("link", { name: "234 567 8905" }).closest("tr")!;
    fireEvent.click(within(row).getByTestId("watchlist-recheck"));
    expect(fetchPnr).toHaveBeenCalledWith("2345678905", { fresh: true });
    expect(within(row).getByTestId("watchlist-recheck")).toHaveTextContent("Checking…");

    resolve({ outcome, cached: false, latencyMs: 12 });
    expect(await screen.findByText("234 567 8905: still WL 5 · retrieved just now from the development fixture")).toBeInTheDocument();
    expect(within(row).getByTestId("watchlist-recheck")).toHaveTextContent("Re-check");
    expect(within(row).getByText("4 checks")).toBeInTheDocument();
  });

  it("announces a failed re-check without touching the entry", async () => {
    seed(ENTRIES);
    vi.mocked(fetchPnr).mockResolvedValue({ outcome: { ok: false, code: "SOURCE_UNAVAILABLE", message: "The source did not answer." }, cached: false, latencyMs: 0 });
    view();
    fireEvent.click(screen.getAllByTestId("watchlist-recheck")[1]!);
    expect(await screen.findByText("234 567 8905: not re-checked · The source did not answer.")).toBeInTheDocument();
    expect(watchlistStore.get().find((e) => e.pnr === "2345678905")?.checks).toHaveLength(3);
  });
});

describe("WatchlistView — your account", () => {
  it("reads the account entries and drops the device-only actions", () => {
    view({ signedIn: true, initialEntries: ENTRIES });
    expect(screen.getByText("Saved to your account.")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Saved PNRs — your account" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in to sync" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear all on this device" })).toBeNull();
  });

  it("removes through the API and restores the full entry on undo", async () => {
    vi.mocked(api.deleteWatchlist).mockResolvedValue({ ok: true, data: true });
    vi.mocked(api.saveWatchlist).mockImplementation(async (input) => ({ ok: true, data: { pnr: input.pnr, label: input.label, addedAt: at(0), checks: [...input.checks] } }));
    view({ signedIn: true, initialEntries: ENTRIES });
    fireEvent.click(screen.getAllByTestId("watchlist-remove")[0]!);
    expect(await screen.findByText("Removed 234 567 8909")).toBeInTheDocument();
    expect(api.deleteWatchlist).toHaveBeenCalledWith("2345678909");

    fireEvent.click(screen.getByRole("button", { name: "Undo remove" }));
    expect(await screen.findByText("Restored")).toBeInTheDocument();
    expect(api.saveWatchlist).toHaveBeenCalledWith({ pnr: "2345678909", label: ENTRIES[0]!.label, checks: ENTRIES[0]!.checks });
    expect(screen.getByRole("link", { name: "234 567 8909" })).toBeInTheDocument();
  });

  it("puts the entry back when the API refuses the removal", async () => {
    vi.mocked(api.deleteWatchlist).mockResolvedValue({ ok: false, error: { ok: false, code: "INTERNAL", message: "No" } });
    view({ signedIn: true, initialEntries: ENTRIES });
    fireEvent.click(screen.getAllByTestId("watchlist-remove")[1]!);
    await waitFor(() => expect(screen.getByText("234 567 8905 could not be removed. It is still saved.")).toBeInTheDocument());
    const links = screen.getAllByRole("link", { name: /^\d{3} \d{3} \d{4}$/ }).map((a) => a.textContent);
    expect(links).toEqual(["234 567 8909", "234 567 8905", "234 567 8903"]);
    expect(screen.queryByRole("button", { name: /Undo/ })).toBeNull();
  });

  it("renders the load error plate with a retry", () => {
    view({ signedIn: true, loadError: true });
    expect(screen.getByRole("alert")).toHaveTextContent("Your watchlist could not be loaded.");
    expect(screen.getByRole("alert")).toHaveTextContent("The account service did not answer. Nothing on your account was changed.");
    expect(screen.queryByText("0 saved")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refresh).toHaveBeenCalled();
  });
});
