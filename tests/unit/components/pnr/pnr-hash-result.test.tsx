import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PnrFetchResult } from "@/services/pnr-source";
import { buildFixtureResult } from "@/services/sources/fixture";

// The result page reads the PNR from the hash (never sent to a server) and asks the API by POST.

const fetchPnr = vi.fn<(pnr: string, options?: { readonly fresh?: boolean }) => Promise<PnrFetchResult>>();
vi.mock("@/services/pnr-source", () => ({ fetchPnr: (...args: Parameters<typeof fetchPnr>) => fetchPnr(...args) }));
vi.mock("@/components/pnr/pnr-result-view", () => ({
  PnrResultView: ({ pnr }: { readonly pnr: string }) => <p>Record for {pnr}</p>,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { PnrHashResult } = await import("@/components/pnr/pnr-hash-result");

function answer(outcome: PnrFetchResult["outcome"]): PnrFetchResult {
  return { outcome, cached: false, latencyMs: 5 };
}

function setHash(hash: string) {
  window.history.replaceState(null, "", `/pnr${hash}`);
}

beforeEach(() => {
  fetchPnr.mockReset();
});

afterEach(() => {
  setHash("");
});

describe("PnrHashResult", () => {
  it("asks for the PNR in the hash and shows its record", async () => {
    const built = buildFixtureResult("2345678901");
    fetchPnr.mockResolvedValue(answer(built));
    setHash("#2345678901");
    render(<PnrHashResult source="fixture" />);
    expect(await screen.findByText("Record for 2345678901")).toBeInTheDocument();
    expect(fetchPnr).toHaveBeenCalledWith("2345678901", { fresh: false });
  });

  it("shows the check-again sheet, and asks nothing, when the hash holds no PNR", () => {
    setHash("#12345");
    render(<PnrHashResult source="fixture" />);
    expect(screen.getByText("That is not a PNR")).toBeInTheDocument();
    expect(fetchPnr).not.toHaveBeenCalled();
  });

  it("labels a no-record answer with the deployment's source", async () => {
    fetchPnr.mockResolvedValue(answer({ ok: false, code: "NOT_FOUND", message: "none" }));
    setHash("#5827194603");
    render(<PnrHashResult source="live" />);
    expect(await screen.findByRole("heading", { level: 2, name: "No record for this PNR" })).toBeInTheDocument();
    expect(screen.getByText(/from Trakline/)).toBeInTheDocument();
  });

  it("explains an unavailable source and retries with a fresh read", async () => {
    fetchPnr.mockResolvedValue(answer({ ok: false, code: "SOURCE_UNAVAILABLE", message: "The reservation service did not answer in time. Nothing was shown in its place." }));
    setHash("#2345678901");
    render(<PnrHashResult source="live" />);
    expect(await screen.findByText("The reservation service did not answer in time. Nothing was shown in its place.")).toBeInTheDocument();
    act(() => screen.getByTestId("retry").click());
    await waitFor(() => expect(fetchPnr).toHaveBeenLastCalledWith("2345678901", { fresh: true }));
  });

  it("follows the hash when it changes to another PNR", async () => {
    fetchPnr.mockImplementation(async (pnr) => answer(buildFixtureResult(pnr)));
    setHash("#2345678901");
    render(<PnrHashResult source="fixture" />);
    expect(await screen.findByText("Record for 2345678901")).toBeInTheDocument();
    act(() => {
      setHash("#2345678903");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(await screen.findByText("Record for 2345678903")).toBeInTheDocument();
  });

  it("puts the PNR in the tab title, which never leaves the browser", async () => {
    fetchPnr.mockResolvedValue(answer(buildFixtureResult("2345678901")));
    setHash("#2345678901");
    render(<PnrHashResult source="fixture" />);
    await screen.findByText("Record for 2345678901");
    expect(document.title).toBe("PNR 234 567 8901 · Trakline");
  });
});
