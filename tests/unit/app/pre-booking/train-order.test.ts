import { describe, expect, it } from "vitest";
import { minutesOf, orderRows, type SortKey } from "@/app/(site)/pre-booking/train-order";
import type { TrainRow } from "@/services/route-availability";

// Sorting and filtering the list, over rows already in hand — no request is spent on either.
//
// The rule under every case here: a value the source did not give is not a zero. A train whose
// duration cannot be read, or whose fare never came, sorts LAST rather than first, because sorting
// it first would answer "cheapest" or "quickest" with a train nobody can price or time.

function row(trainNo: string, over: { departs?: string | null; travelTime?: string | null; fare?: number | null; canBook?: boolean } = {}): TrainRow {
  const day = {
    date: "2026-10-16",
    status: "AVAILABLE",
    availabilityText: "AVAILABLE",
    rawStatus: "AVAILABLE",
    canBook: over.canBook ?? true,
    wlBooking: null,
    wlCurrent: null,
    seats: null,
    prediction: null,
    predictionPercentage: null,
  };
  const fare = over.fare === undefined ? 1000 : over.fare;
  return {
    train: {
      trainNo,
      trainName: `TRAIN ${trainNo}`,
      fromCode: "SBC",
      fromName: "SBC",
      toCode: "NDLS",
      toName: "NDLS",
      originCode: "SBC",
      originName: "SBC",
      destinationCode: "NDLS",
      destinationName: "NDLS",
      departs: over.departs === undefined ? "12:00" : over.departs,
      arrives: "09:00",
      travelTime: over.travelTime === undefined ? "10h 00m" : over.travelTime,
      runningDays: null,
      runsOn: null,
      halts: null,
      distanceKm: null,
    },
    answers: {
      SL: {
        train: { no: trainNo, name: "", fromName: "SBC", toName: "NDLS", distanceKm: 0 },
        fare: fare === null ? null : { base: fare, reservation: 0, superfast: 0, gst: 0, total: fare },
        days: [day],
        retrievedAt: "2026-10-16T08:39:00.000Z",
      },
    },
    pending: [],
    beyondCap: false,
    failed: false,
  };
}

const order = (rows: readonly TrainRow[], sort: SortKey, onlyBookable = false) =>
  orderRows(rows, "SL", sort, onlyBookable).map((r) => r.train.trainNo);

describe("reading a duration the provider wrote its own way", () => {
  it("reads both forms the sources actually send", () => {
    // RailKit sends "37h 40m"; the sample route sends "34:10 hrs". Neither is re-derived from the
    // two times — the spec keeps the provider's own duration verbatim, so both are parsed as given.
    expect(minutesOf("37h 40m")).toBe(37 * 60 + 40);
    expect(minutesOf("34:10 hrs")).toBe(34 * 60 + 10);
    expect(minutesOf("9h")).toBe(9 * 60);
  });

  it("refuses a duration it cannot read rather than guessing one", () => {
    for (const bad of [null, "", "soon", "tomorrow"]) expect(minutesOf(bad)).toBeNull();
  });
});

describe("ordering the list", () => {
  it("sorts by departure, earliest first", () => {
    expect(order([row("A", { departs: "19:20" }), row("B", { departs: "06:05" }), row("C", { departs: "13:30" })], "departure")).toEqual(["B", "C", "A"]);
  });

  it("sorts by duration, shortest first", () => {
    expect(order([row("A", { travelTime: "37h 40m" }), row("B", { travelTime: "33:30 hrs" }), row("C", { travelTime: "44h 10m" })], "duration")).toEqual(["B", "A", "C"]);
  });

  it("sorts by fare, cheapest first, on the class every row carries", () => {
    expect(order([row("A", { fare: 2325 }), row("B", { fare: 710 }), row("C", { fare: 1890 })], "fare")).toEqual(["B", "C", "A"]);
  });

  it("puts a row with no fare last, never as zero", () => {
    expect(order([row("A", { fare: 2325 }), row("B", { fare: null }), row("C", { fare: 710 })], "fare")).toEqual(["C", "A", "B"]);
  });

  it("puts a duration it could not read last", () => {
    expect(order([row("A", { travelTime: "37h 40m" }), row("B", { travelTime: null }), row("C", { travelTime: "20h 00m" })], "duration")).toEqual(["C", "A", "B"]);
  });

  it("puts a departure it could not read last", () => {
    expect(order([row("A", { departs: "19:20" }), row("B", { departs: null }), row("C", { departs: "06:05" })], "departure")).toEqual(["C", "A", "B"]);
  });

  it("keeps the source's order when two rows tie", () => {
    // A stable sort, so a second click never shuffles rows that are genuinely equal.
    expect(order([row("A", { departs: "08:00" }), row("B", { departs: "08:00" }), row("C", { departs: "07:00" })], "departure")).toEqual(["C", "A", "B"]);
  });
});

describe("keeping only what can be booked", () => {
  it("drops a row whose lead class cannot be booked", () => {
    expect(order([row("A"), row("B", { canBook: false }), row("C")], "departure", true)).toEqual(["A", "C"]);
  });

  it("drops a row that has no answer at all", () => {
    // Nothing was asked, or the ask failed. Either way there is no berth to claim, and keeping it
    // under a filter that says "only what I can book" would be a claim.
    const nothing = { ...row("B"), answers: {}, failed: true };
    expect(order([row("A"), nothing, row("C")], "departure", true)).toEqual(["A", "C"]);
  });

  it("keeps every row when the filter is off", () => {
    expect(order([row("A"), row("B", { canBook: false })], "departure", false)).toEqual(["A", "B"]);
  });
});
