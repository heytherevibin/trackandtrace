import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AvailabilityAnswer, AvailabilityDayRecord } from "@/services/availability-source";

const { AvailabilityPlate } = await import("@/app/(site)/pre-booking/availability-plate");

// Status colour. Three facts, three tokens: a berth is open, a queue is forming, booking is closed.
//
// The rule these tests pin is what the colour is keyed to. It reports WHAT THE SOURCE SAID and
// nothing else — a queue of 9 and a queue of 148 wear the same amber, because a colour that eased
// towards green as a waitlist shortened would be a prediction, and this product does not make one.
//
// `canBook` outranks the status word: a day the source will not sell is closed however it is
// labelled, so "AVAILABLE" with canBook false must not render as an open berth.

function day(over: Partial<AvailabilityDayRecord> = {}): AvailabilityDayRecord {
  return {
    date: "2026-10-16",
    status: "AVAILABLE",
    availabilityText: "AVAILABLE-0037",
    rawStatus: "AVAILABLE-0037",
    canBook: true,
    wlBooking: null,
    wlCurrent: null,
    seats: null,
    prediction: null,
    predictionPercentage: null,
    ...over,
  };
}

function plate(days: readonly AvailabilityDayRecord[]): AvailabilityAnswer {
  return {
    train: { no: "12627", name: "KARNATAKA EXP", fromName: "SBC", toName: "NDLS", distanceKm: 2444 },
    fare: null,
    days,
    retrievedAt: "2026-10-16T08:39:00.000Z",
  };
}

function draw(days: readonly AvailabilityDayRecord[]) {
  render(<AvailabilityPlate answer={plate(days)} todayIso="2026-09-25" retrievedAt="14:09 IST" sampleData={false} />);
}

describe("availability status colour", () => {
  it("draws an open berth in the open tokens", () => {
    draw([day()]);
    expect(screen.getByText("AVAILABLE")).toHaveClass("bg-open-soft", "text-open-soft-ink");
  });

  it("draws a queue in the queued tokens, figure included", () => {
    draw([day({ status: "WL", canBook: true, rawStatus: "GNWL136/WL12", wlBooking: 136, wlCurrent: 12 })]);
    expect(screen.getByText("WL")).toHaveClass("bg-queued-soft", "text-queued-soft-ink");
    expect(screen.getByText("12")).toHaveClass("text-queued-soft-ink");
  });

  it("keeps the same amber however long the queue is, because the colour is not a forecast", () => {
    // A long queue, in a form that actually occurs. This fixture used to read
    // `wlBooking: 136, wlCurrent: 148` — a position standing WORSE than the one it
    // was issued at, which no row in the live store does, with a `rawStatus` of
    // `AVAILABLE-0037` that agreed with neither figure. It passed only because
    // nothing read `rawStatus`.
    draw([day({ status: "WL", canBook: true, rawStatus: "GNWL244/WL148", wlBooking: 244, wlCurrent: 148 })]);
    expect(screen.getByText("WL")).toHaveClass("bg-queued-soft", "text-queued-soft-ink");
    expect(screen.getByText("148")).toHaveClass("text-queued-soft-ink");
  });

  it("draws a day that cannot be booked in the closed tokens, whatever its status word says", () => {
    draw([day({ status: "AVAILABLE", canBook: false })]);
    const chip = screen.getByText("AVAILABLE");
    expect(chip).toHaveClass("bg-closed-soft", "text-closed-soft-ink");
    expect(chip).not.toHaveClass("bg-open-soft");
  });

  it("never leaves colour as the only signal", () => {
    draw([day({ status: "WL", canBook: false, rawStatus: "GNWL136/WL12", wlBooking: 136, wlCurrent: 12 })]);
    // The word is still there for anyone who cannot see the fill.
    expect(screen.getByText("WL")).toBeInTheDocument();
    expect(screen.getByText("Booking closed")).toBeInTheDocument();
  });

  it("says a day is closed once, on one line", () => {
    draw([day({ status: "WL", canBook: false, rawStatus: "GNWL20/WL12", wlBooking: 20, wlCurrent: 12 })]);
    // A sentence under the row repeating the chip cost every closed row a second line — one row in
    // four standing twice as tall as its neighbours — and added nothing the chip had not said.
    expect(screen.queryByText(/Booking is closed for this date/)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// How far the queue has already drained.
//
// This is the one number on the row a traveller can act on, and it is already in
// the answer: `GNWL65/WL26` says the next booking is ISSUED at 65 and CURRENTLY
// stands 26th, so 39 of the 65 ahead have gone. No stored history is involved —
// which matters, because the observation store covers twelve combos and
// travellers search everything.
//
// It is read from `rawStatus` through `queueMovement`, NOT from the `wlBooking` /
// `wlCurrent` pair, and the fixtures below therefore carry a rawStatus that
// agrees with them. The reason is the last case in this block.
//
// It is not a forecast. It says what has happened, never what will.
// ---------------------------------------------------------------------------

describe("queue movement on the day row", () => {
  it("says how many of the places ahead have already cleared", () => {
    draw([day({ status: "WL", canBook: true, rawStatus: "GNWL65/WL26", wlBooking: 65, wlCurrent: 26 })]);
    expect(screen.getByText("26")).toBeInTheDocument();
    expect(screen.getByText("39 of 65 ahead have cleared")).toBeInTheDocument();
  });

  it("says nobody has cleared rather than printing a zero", () => {
    draw([day({ status: "WL", canBook: true, rawStatus: "GNWL9/WL9", wlBooking: 9, wlCurrent: 9 })]);
    expect(screen.getByText("nobody has cleared yet")).toBeInTheDocument();
  });

  it("reads an RAC pair, whose spacing varies in the real data", () => {
    draw([day({ status: "WAITLIST", canBook: true, rawStatus: "RAC  58/RAC  51", wlBooking: 58, wlCurrent: 51 })]);
    expect(screen.getByText("7 of 58 ahead have cleared")).toBeInTheDocument();
  });

  it("says the waitlist has cleared when the source says the queue is gone", () => {
    draw([day({ status: "WAITLIST", canBook: true, rawStatus: "PQWL/AVAILABLE", wlBooking: null, wlCurrent: null })]);
    expect(screen.getByText("the waitlist has cleared")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // The bug this block was written for, found in the live store on 2026-09-27.
  // ---------------------------------------------------------------------------

  it("does not claim a queue grew when the position moved out of the waitlist into RAC", () => {
    // `GNWL5/RAC48`: issued at general waitlist 5, now standing at RAC 48. RAC is
    // a BETTER state — a shared seat rather than none — so the two figures are not
    // on one scale. Reading the pair directly rendered "48 · of 5 when booking
    // opened", which says the queue grew almost tenfold. Four rows in 433 carry
    // this form, and it was on production.
    draw([day({ status: "WAITLIST", canBook: true, rawStatus: "GNWL5/RAC48", wlBooking: 5, wlCurrent: 48 })]);
    expect(screen.queryByText(/of 5 when booking opened/)).not.toBeInTheDocument();
    expect(screen.queryByText(/of 5 ahead have cleared/)).not.toBeInTheDocument();
    expect(screen.getByText("now RAC, up from the waitlist")).toBeInTheDocument();
  });

  it("says nothing at all about movement when the form carries no pair", () => {
    draw([day({ status: "AVAILABLE", canBook: true, rawStatus: "AVAILABLE-0037" })]);
    expect(screen.queryByText(/ahead have cleared/)).not.toBeInTheDocument();
    expect(screen.queryByText(/nobody has cleared/)).not.toBeInTheDocument();
  });
});
