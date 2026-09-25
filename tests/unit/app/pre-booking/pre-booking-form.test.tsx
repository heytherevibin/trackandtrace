import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreBookingForm } from "@/app/(site)/pre-booking/pre-booking-form";
import { messages } from "@/messages";

// Form TL-02 v2: stations, a date and the classes you would travel in. One search answers every
// train on the route.
//
// Most of what is worth pinning here is about NOT asking. The route lookup and the search both cost
// provider requests from a plan shared with live PNR checks and the crawler, so: nothing before a
// pair reads like a pair, nothing before a date, nothing at all when the pair has no trains, and
// never a list rendered from a refusal.

// 06:30 UTC on 17 September 2026 is midday IST, so "today" in IST is 2026-09-17.
const NOW = new Date("2026-09-17T06:30:00.000Z");

const m = messages.booking;
const dateInput = () => screen.getByLabelText(m.date);
const searchButton = () => screen.getByRole("button", { name: m.submit });
const lifecycle = () => within(screen.getByRole("list", { name: m.lifecycle })).getAllByRole("listitem");

const TRAIN = {
  trainNo: "12627",
  trainName: "KARNATAKA EXP",
  fromCode: "SBC",
  fromName: "SBC",
  toCode: "NDLS",
  toName: "NDLS",
  originCode: "SBC",
  originName: "SBC",
  destinationCode: "NDLS",
  destinationName: "NDLS",
  departs: "20:00",
  arrives: "06:10",
  travelTime: "34:10 hrs",
  runningDays: "1111111",
  runsOn: [true, true, true, true, true, true, true],
  halts: 31,
  distanceKm: 2444,
};

const ROW = {
  train: TRAIN,
  answers: {
    "2A": {
      train: { no: "12627", name: "KARNATAKA EXP", fromName: "SBC", toName: "NDLS", distanceKm: 2444 },
      fare: { base: 3290, reservation: 0, superfast: 0, gst: 0, total: 3290 },
      days: [{ date: "2026-10-16", status: "WL", availabilityText: "GNWL136/WL44", rawStatus: "GNWL136/WL44", canBook: true, wlBooking: 136, wlCurrent: 44, seats: null, prediction: null, predictionPercentage: null }],
      retrievedAt: "2026-10-16T08:39:00.000Z",
    },
  },
  pending: ["3A", "SL"],
  beyondCap: false,
  failed: false,
};

/** Routes each endpoint to its own answer, and counts what was asked of each. */
function stubFetch(over: { readonly trains?: unknown[]; readonly search?: { status: number; body: unknown } } = {}) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string, init?: { readonly body?: string }) => {
    void init;
    calls.push(String(url));
    if (String(url).startsWith("/api/trains")) {
      return { ok: true, json: async () => ({ ok: true, trains: over.trains ?? [TRAIN], sampleData: true }) };
    }
    const search = over.search ?? { status: 200, body: { ok: true, sampleData: true, from: "SBC", to: "NDLS", journeyDate: "2026-10-16", leadClass: "2A", rows: [ROW], retrievedAt: "2026-10-16T08:39:00.000Z" } };
    return { ok: search.status < 400, json: async () => search.body };
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

/** The real debounce elapses here: waitFor polls on its own clock, and faking setTimeout stalls it. */
const settle = (ms = 350) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

/**
 * Types a pair and waits for the route to have ANSWERED, not for a fixed number of milliseconds.
 *
 * A sleep long enough on an idle machine is not long enough on a busy one, and the failure it
 * produces looks like a broken lifecycle rather than a slow debounce. Both answers — trains, and no
 * trains — name the pair, so waiting for that sentence waits for either.
 */
async function enterPair(from = "SBC", to = "NDLS"): Promise<void> {
  fireEvent.change(screen.getByLabelText(m.from), { target: { value: from } });
  fireEvent.change(screen.getByLabelText(m.to), { target: { value: to } });
  await settle();
  // `getAllBy`, because the lifecycle names the pair too — and that is the point: once either
  // sentence exists, the route has answered.
  await waitFor(() => expect(screen.getAllByText(new RegExp(`${from.toUpperCase()} → ${to.toUpperCase()}`)).length).toBeGreaterThan(0));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("searching a route", () => {
  it("opens with three classes chosen and nothing asked", async () => {
    const { calls } = stubFetch();
    render(<PreBookingForm />);
    for (const cls of ["SL", "3A", "2A"]) {
      expect(screen.getByRole("button", { name: cls })).toHaveAttribute("aria-pressed", "true");
    }
    expect(searchButton()).toBeDisabled();
    await settle();
    expect(calls).toHaveLength(0);
  });

  it("looks up the route once a pair reads like a pair, and not before", async () => {
    const { calls } = stubFetch();
    render(<PreBookingForm />);
    fireEvent.change(screen.getByLabelText(m.from), { target: { value: "S" } });
    await settle();
    expect(calls).toHaveLength(0);
    await enterPair();
    expect(calls.filter((c) => c.startsWith("/api/trains"))).toHaveLength(1);
  });

  it("will not search before a date is given", async () => {
    stubFetch();
    render(<PreBookingForm />);
    await enterPair();
    expect(searchButton()).toBeDisabled();
    fireEvent.change(dateInput(), { target: { value: "2026-10-16" } });
    expect(searchButton()).toBeEnabled();
  });

  it("will not search a pair the railway has no trains for", async () => {
    stubFetch({ trains: [] });
    render(<PreBookingForm />);
    await enterPair("SBC", "XXXX");
    fireEvent.change(dateInput(), { target: { value: "2026-10-16" } });
    // Said under the field, and the search is not offered: spending one here buys nothing.
    expect(screen.getByText(m.route.none("SBC", "XXXX"))).toBeInTheDocument();
    expect(searchButton()).toBeDisabled();
  });

  it("posts the chosen classes, and lists what comes back", async () => {
    const { fetchMock } = stubFetch();
    render(<PreBookingForm />);
    await enterPair();
    fireEvent.change(dateInput(), { target: { value: "2026-10-16" } });
    fireEvent.click(searchButton());

    await waitFor(() => expect(screen.getByTestId("train-row")).toBeInTheDocument());
    const sent = fetchMock.mock.calls.find(([url]) => String(url) === "/api/route-availability")?.[1];
    expect(JSON.parse(sent?.body ?? "null")).toEqual({
      from: "SBC",
      to: "NDLS",
      journeyDate: "2026-10-16",
      quota: "GN",
      // In the enum's order, so the lead is the same for any reader who picked these three.
      classes: ["2A", "3A", "SL"],
    });
    expect(screen.getByText("KARNATAKA EXP")).toBeInTheDocument();
    expect(screen.getByText("3A, SL not asked yet")).toBeInTheDocument();
  });

  it("shows a refusal and no list when the search is refused", async () => {
    stubFetch({ search: { status: 503, body: { ok: false, code: "SOURCE_UNAVAILABLE", message: "Trakline has used today's live checks." } } });
    render(<PreBookingForm />);
    await enterPair();
    fireEvent.change(dateInput(), { target: { value: "2026-10-16" } });
    fireEvent.click(searchButton());

    await waitFor(() => expect(screen.getByText("Trakline has used today's live checks.")).toBeInTheDocument());
    // An empty list reads as "no berths". A refused search must never draw one.
    expect(screen.queryByTestId("train-row")).not.toBeInTheDocument();
  });

  it("refuses a date in the past without asking anything", async () => {
    const { calls } = stubFetch();
    render(<PreBookingForm />);
    await enterPair();
    fireEvent.change(dateInput(), { target: { value: "2026-09-16" } });
    expect(screen.getByText(m.pastDate)).toBeInTheDocument();
    expect(searchButton()).toBeDisabled();
    expect(calls.filter((c) => c === "/api/route-availability")).toHaveLength(0);
  });

  it("marks the route resolved and the search done on the lifecycle", async () => {
    stubFetch();
    render(<PreBookingForm />);
    expect(lifecycle()).toHaveLength(4);
    await enterPair();
    fireEvent.change(dateInput(), { target: { value: "2026-10-16" } });
    fireEvent.click(searchButton());

    await waitFor(() => expect(lifecycle()[1]).toHaveAttribute("data-state", "done"));
    expect(lifecycle()[2]).toHaveAttribute("data-state", "done");
  });
});
