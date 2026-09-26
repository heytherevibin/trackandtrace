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
    draw([day({ status: "WL", canBook: true, wlBooking: 136, wlCurrent: 12 })]);
    expect(screen.getByText("WL")).toHaveClass("bg-queued-soft", "text-queued-soft-ink");
    expect(screen.getByText("12")).toHaveClass("text-queued-soft-ink");
  });

  it("keeps the same amber however long the queue is, because the colour is not a forecast", () => {
    draw([day({ status: "WL", canBook: true, wlBooking: 136, wlCurrent: 148 })]);
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
    draw([day({ status: "WL", canBook: false, wlBooking: 136, wlCurrent: 12 })]);
    // The word is still there for anyone who cannot see the fill.
    expect(screen.getByText("WL")).toBeInTheDocument();
    expect(screen.getByText("Booking closed")).toBeInTheDocument();
  });

  it("says a day is closed once, on one line", () => {
    draw([day({ status: "WL", canBook: false, wlBooking: 20, wlCurrent: 12 })]);
    // A sentence under the row repeating the chip cost every closed row a second line — one row in
    // four standing twice as tall as its neighbours — and added nothing the chip had not said.
    expect(screen.queryByText(/Booking is closed for this date/)).not.toBeInTheDocument();
  });
});
