import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AvailabilityDayRecord } from "@/services/availability-source";
import type { RouteAvailabilityAnswer, TrainRow } from "@/services/route-availability";
import type { RouteTrain } from "@/services/route-source";

const { TrainsPlate } = await import("@/app/(site)/pre-booking/trains-plate");

// The controls strip and the expand: everything the list does after the one search that filled it.
//
// Sorting and filtering spend nothing — the rows are already in hand. Opening a row spends two
// requests and is the only thing on this surface that does, so most of what is pinned here is about
// when it asks and what it says when it cannot.

function train(trainNo: string, over: Partial<RouteTrain> = {}): RouteTrain {
  return {
    trainNo,
    trainName: `TRAIN ${trainNo}`,
    originCode: "SBC",
    originName: "SBC",
    destinationCode: "NDLS",
    destinationName: "NDLS",
    fromCode: "YPR",
    fromName: "YPR",
    toCode: "NZM",
    toName: "NZM",
    departs: "12:00",
    arrives: "09:00",
    travelTime: "10h 00m",
    runningDays: null,
    runsOn: null,
    halts: null,
    distanceKm: null,
    ...over,
  };
}

function day(over: Partial<AvailabilityDayRecord> = {}): AvailabilityDayRecord {
  return {
    date: "2026-10-16",
    status: "AVAILABLE",
    availabilityText: "AVAILABLE",
    rawStatus: "AVAILABLE",
    canBook: true,
    wlBooking: null,
    wlCurrent: null,
    seats: null,
    prediction: null,
    predictionPercentage: null,
    ...over,
  };
}

function answer(total: number | null, days: readonly AvailabilityDayRecord[] = [day()]) {
  return {
    train: { no: "12627", name: "KARNATAKA EXP", fromName: "SBC", toName: "NDLS", distanceKm: 2444 },
    fare: total === null ? null : { base: total, reservation: 0, superfast: 0, gst: 0, total },
    days,
    retrievedAt: "2026-10-16T08:39:00.000Z",
  };
}

function row(trainNo: string, over: Partial<TrainRow> = {}, trainOver: Partial<RouteTrain> = {}): TrainRow {
  return { train: train(trainNo, trainOver), answers: { SL: answer(1000) }, pending: ["3A", "2A"], notCarried: [], notBookable: false, beyondCap: false, failed: false, ...over };
}

function plate(rows: readonly TrainRow[]): RouteAvailabilityAnswer {
  return { from: "SBC", to: "NDLS", journeyDate: "2026-10-16", leadClass: "SL", rows, retrievedAt: "14:09" };
}

function draw(rows: readonly TrainRow[]) {
  render(<TrainsPlate answer={plate(rows)} refusal={null} sampleData={false} quota="GN" />);
}

const numbers = () => screen.getAllByTestId("train-row").map((r) => within(r).getByText(/^\d{5}$/).textContent);

afterEach(() => vi.unstubAllGlobals());

describe("sorting and filtering the list", () => {
  it("sorts one of three, and shows which one", () => {
    draw([row("11111"), row("22222")]);
    expect(screen.getByRole("button", { name: "Departure" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Duration" }));
    expect(screen.getByRole("button", { name: "Duration" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Departure" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Fare" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reorders the rows on screen, spending nothing", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    draw([row("11111", {}, { departs: "19:20" }), row("22222", {}, { departs: "06:05" })]);
    expect(numbers()).toEqual(["22222", "11111"]);
    fireEvent.click(screen.getByRole("button", { name: "Fare" }));
    // Every row is already in hand; re-asking to reorder would pay twice for one answer.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps what it says it keeps", () => {
    draw([row("11111"), row("22222", { answers: { SL: answer(1000, [day({ canBook: false })]) } })]);
    expect(numbers()).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Only what I can book" }));
    expect(numbers()).toEqual(["11111"]);
  });
});

describe("opening a row", () => {
  it("asks only for the classes it has not asked, and shows them", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, answers: { "3A": answer(2325), "2A": answer(3290) }, failedClasses: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    draw([row("12627")]);

    fireEvent.click(screen.getByRole("button", { name: "More classes and dates" }));
    await waitFor(() => expect(screen.getAllByTestId("class-block")).toHaveLength(3));

    const sent = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body));
    // The train's own stations, not the pair the search was for: 12627 here calls at YPR and NZM,
    // and a train asked about a pair it does not serve is refused.
    expect(sent).toEqual({ trainNo: "12627", from: "YPR", to: "NZM", journeyDate: "2026-10-16", quota: "GN", travelClasses: ["3A", "2A"] });
    expect(screen.queryByText(/not asked yet/)).not.toBeInTheDocument();
  });

  it("shows the other three dates, which cost nothing extra", async () => {
    const four = ["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"].map((date) => day({ date }));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, answers: { "3A": answer(2325, four) }, failedClasses: [] }) })));
    draw([row("12627", { answers: { SL: answer(1000, four) }, pending: ["3A"] })]);

    fireEvent.click(screen.getByRole("button", { name: "More classes and dates" }));
    // Four dates came back with the first ask; opening the row stops hiding three of them.
    await waitFor(() => expect(screen.getByRole("table", { name: /availability/i })).toBeVisible());
    expect(within(screen.getByRole("table", { name: /availability/i })).getAllByRole("row")).toHaveLength(5);
  });

  it("says a class could not be answered rather than leaving it out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, answers: { "3A": answer(2325) }, failedClasses: ["2A"] }) })));
    draw([row("12627")]);

    fireEvent.click(screen.getByRole("button", { name: "More classes and dates" }));
    // An absent class reads as "not carried", which is a fact about the train. This is a fact
    // about the request, and the two must never be confused.
    await waitFor(() => expect(screen.getByText("2A could not be answered")).toBeInTheDocument());
  });

  it("keeps the row and says so when the whole expand is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({ ok: false, message: "Trakline has used today's live checks." }) })));
    draw([row("12627")]);

    fireEvent.click(screen.getByRole("button", { name: "More classes and dates" }));
    await waitFor(() => expect(screen.getByText("Trakline has used today's live checks.")).toBeInTheDocument());
    // The class the search did answer is still on screen; a refused expand takes nothing away.
    expect(screen.getAllByTestId("class-block")).toHaveLength(1);
    expect(screen.getByTestId("train-row")).toBeInTheDocument();
  });

  it("asks once, however many times the button is pressed", async () => {
    const fetchMock = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { ok: true, json: async () => ({ ok: true, answers: { "3A": answer(2325) }, failedClasses: [] }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    draw([row("12627", { pending: ["3A"] })]);

    const open = screen.getByRole("button", { name: "More classes and dates" });
    fireEvent.click(open);
    fireEvent.click(open);
    await waitFor(() => expect(screen.getAllByTestId("class-block")).toHaveLength(2));
    // Each press costs provider requests, so a double click must not cost two expands.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the other three dates without asking for anything, once every class is in hand", async () => {
    const four = ["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"].map((date) => day({ date }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    draw([row("12627", { answers: { SL: answer(1000, four) }, pending: [], notCarried: [] })]);

    // Nothing is pending, so there is nothing to ask: the four dates came back with the search and
    // opening the row only stops hiding three of them.
    fireEvent.click(screen.getByRole("button", { name: "Three more dates" }));
    await waitFor(() => expect(screen.getByRole("table", { name: /availability/i })).toBeVisible());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hides the dates again on a second press, and asks for nothing either way", async () => {
    const four = ["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"].map((date) => day({ date }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    draw([row("12627", { answers: { SL: answer(1000, four) }, pending: [], notCarried: [] })]);

    fireEvent.click(screen.getByRole("button", { name: "Three more dates" }));
    await waitFor(() => expect(screen.getByRole("table", { name: /availability/i })).toBeVisible());
    // The rows are in hand, so the press only showed them — and pressing again only hides them.
    // The control greying out after one use read as broken, having cost nothing to use.
    fireEvent.click(screen.getByRole("button", { name: "Hide dates" }));
    await waitFor(() => expect(screen.queryByRole("table", { name: /availability/i })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Three more dates" }));
    await waitFor(() => expect(screen.getByRole("table", { name: /availability/i })).toBeVisible());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says which class the dates belong to, and follows the one the reader picks", async () => {
    const dates = (from: number) => [16, 17, 18, 19].map((d) => day({ date: `2026-10-${d}`, wlCurrent: from + d }));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    draw([row("12627", { answers: { SL: answer(1000, dates(0)), "3A": answer(2325, dates(100)) }, pending: [], notCarried: [] })]);

    fireEvent.click(screen.getByRole("button", { name: "Three more dates" }));
    // A row carries every chosen class now, so an uncaptioned table is four possible answers and
    // no way to tell which. It leads with the class the list is ranked by.
    await waitFor(() => expect(screen.getByText("Dates for SL")).toBeVisible());

    // And the reader is not stuck with it: the cards are the control.
    fireEvent.click(screen.getByRole("button", { name: /3A/ }));
    await waitFor(() => expect(screen.getByText("Dates for 3A")).toBeVisible());
    expect(screen.queryByText("Dates for SL")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers nothing to open when a row has one date and nothing pending", () => {
    draw([row("12627", { answers: { SL: answer(1000) }, pending: [], notCarried: [] })]);
    expect(screen.queryByRole("button", { name: /dates/ })).not.toBeInTheDocument();
  });

  it("never offers to open a row the cap stopped it asking", () => {
    draw([row("12627", { answers: {}, beyondCap: true, pending: ["SL", "3A", "2A"] })]);
    expect(screen.queryByRole("button", { name: "More classes and dates" })).not.toBeInTheDocument();
  });
});
