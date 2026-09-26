import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TrainRoutePopover } from "@/app/(site)/pre-booking/train-route-strip";
import type { RouteTrain } from "@/services/route-source";

// The run behind the corner icon.
//
// One provider request buys one train's run, and a search lists up to twelve — so the thing these
// tests hold is WHEN it asks, not just what it draws. Asking on render, or asking again on every
// hover, would turn a hover into a bill.

function train(over: Partial<RouteTrain> = {}): RouteTrain {
  return {
    trainNo: "12627",
    trainName: "KARNATAKA EXP",
    fromCode: "SBC",
    fromName: "KSR Bengaluru",
    toCode: "NDLS",
    toName: "New Delhi",
    originCode: "MYS",
    originName: "Mysuru Jn",
    destinationCode: "NDLS",
    destinationName: "New Delhi",
    departs: "20:00",
    arrives: "06:10",
    travelTime: "34:10 hrs",
    runningDays: "1111111",
    runsOn: [true, true, true, true, true, true, true],
    halts: 14,
    distanceKm: 2444,
    ...over,
  };
}

const stop = (code: string, name: string, departure: string | null = "10:00") => ({
  code,
  name,
  arrival: "09:58",
  departure,
  haltMinutes: 2,
  distanceKm: 100,
  day: 1,
  platform: null,
});

/** Fourteen stops, which is over the fold and the shape a real run has. */
const RUN = [
  stop("MYS", "Mysuru Jn"),
  stop("MYA", "Mandya"),
  stop("SBC", "KSR Bengaluru"),
  stop("TK", "Tumakuru"),
  stop("DVG", "Davangere"),
  stop("UBL", "Hubballi Jn"),
  stop("BGM", "Belagavi"),
  stop("MRJ", "Miraj Jn"),
  stop("PUNE", "Pune Jn"),
  stop("KYN", "Kalyan Jn"),
  stop("BSL", "Bhusaval Jn"),
  stop("BPL", "Bhopal Jn"),
  stop("JHS", "Jhansi Jn"),
  stop("NDLS", "New Delhi", null),
];

function stubFetch(stops: readonly unknown[] = RUN) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, stops }) }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const openIt = () => fireEvent.mouseEnter(screen.getByRole("button", { name: "This train's run" }).parentElement!);

afterEach(() => vi.unstubAllGlobals());

describe("a train's run", () => {
  it("asks for nothing until it is opened", () => {
    const fetchMock = stubFetch();
    render(<TrainRoutePopover train={train()} />);
    // A search lists up to twelve trains. Fetching on render would be twelve requests nobody asked
    // for, every time the list is drawn.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the points the search already gave before the run arrives", () => {
    stubFetch();
    render(<TrainRoutePopover train={train()} />);
    openIt();
    // Origin, boarding and destination were in the search payload, so the popover says something
    // true at once rather than sitting empty while it loads.
    expect(screen.getByText("MYS")).toBeInTheDocument();
    expect(screen.getByText("SBC")).toBeInTheDocument();
  });

  it("asks once however many times it is reopened", async () => {
    const fetchMock = stubFetch();
    const { container } = render(<TrainRoutePopover train={train()} />);
    const host = container.firstElementChild!;
    fireEvent.mouseEnter(host);
    // Mandya survives the fold and is NOT one of the four points the search carried, so its
    // presence means the fetched run really arrived.
    await waitFor(() => expect(screen.getByText("Mandya")).toBeInTheDocument());
    fireEvent.mouseLeave(host);
    fireEvent.mouseEnter(host);
    fireEvent.mouseLeave(host);
    fireEvent.mouseEnter(host);
    // A run held for a day upstream is still a request per hover if the client re-asks.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("folds the middle of a long run and says how much it is holding", async () => {
    stubFetch();
    render(<TrainRoutePopover train={train()} />);
    openIt();
    await waitFor(() => expect(screen.getByRole("button", { name: "8 more stops" })).toBeInTheDocument());
    // Both ends survive the fold, because both ends are what a traveller checks.
    expect(screen.getByText("MYS")).toBeInTheDocument();
    expect(screen.getByText("New Delhi")).toBeInTheDocument();
    expect(screen.queryByText("Pune Jn")).not.toBeInTheDocument();
  });

  it("opens the middle on a click, and asks for nothing to do it", async () => {
    const fetchMock = stubFetch();
    render(<TrainRoutePopover train={train()} />);
    openIt();
    await waitFor(() => expect(screen.getByRole("button", { name: "8 more stops" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "8 more stops" }));
    // The whole run is already in hand; expanding is drawing, not fetching.
    await waitFor(() => expect(screen.getByText("Pune Jn")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /more stops/ })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("draws a short run whole, with no fold at all", async () => {
    stubFetch([stop("SBC", "KSR Bengaluru"), stop("BPL", "Bhopal Jn"), stop("NDLS", "New Delhi", null)]);
    render(<TrainRoutePopover train={train()} />);
    openIt();
    await waitFor(() => expect(screen.getByText("Bhopal Jn")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /more stops/ })).not.toBeInTheDocument();
  });

  it("keeps the four known points and says so when the run cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ ok: false }) })));
    render(<TrainRoutePopover train={train()} />);
    openIt();
    await waitFor(() => expect(screen.getByText("Trakline could not read this train's run.")).toBeInTheDocument());
    // Still not empty: the search's own points are drawn, because a popover that goes blank on a
    // failure has thrown away something it already had.
    expect(screen.getByText("MYS")).toBeInTheDocument();
  });

  it("marks only the stops between boarding and alighting as the traveller's own", async () => {
    stubFetch();
    render(<TrainRoutePopover train={train()} />);
    openIt();
    await waitFor(() => expect(screen.getByRole("button", { name: "8 more stops" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "8 more stops" }));
    await waitFor(() => expect(screen.getByText("Pune Jn")).toBeInTheDocument());
    const row = (name: string) => screen.getByText(name).closest("li")!;
    // MYS is before boarding: the train's own start, not part of the journey.
    expect(within(row("Mysuru Jn")).getByText("MYS")).toBeInTheDocument();
    expect(row("Mysuru Jn").querySelector(".bg-accent")).toBeNull();
    expect(row("Pune Jn").querySelector(".bg-accent")).not.toBeNull();
  });
});
