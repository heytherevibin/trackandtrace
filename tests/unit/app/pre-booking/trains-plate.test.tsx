import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AvailabilityAnswer, AvailabilityDayRecord } from "@/services/availability-source";
import type { RouteAvailabilityAnswer, TrainRow } from "@/services/route-availability";
import type { RouteTrain } from "@/services/route-source";

const { TrainsPlate } = await import("@/app/(site)/pre-booking/trains-plate");

// The list TL-02 v2 draws: every train the route returns, each carrying the FIRST chosen class,
// with the rest named but not asked. The assertions that matter most are the ones about what is
// NOT shown — an absent block reads as "no berths", and an empty list reads as "no trains".

function train(over: Partial<RouteTrain> = {}): RouteTrain {
  return {
    trainNo: "12627",
    trainName: "KARNATAKA EXP",
    fromCode: "SBC",
    fromName: "KSR Bengaluru",
    toCode: "NDLS",
    toName: "New Delhi",
    originCode: "SBC",
    originName: "KSR Bengaluru",
    destinationCode: "NDLS",
    destinationName: "New Delhi",
    departs: "19:20",
    arrives: "09:00",
    travelTime: "37h 40m",
    runningDays: "1111111",
    runsOn: [true, true, true, true, true, true, true],
    halts: 34,
    distanceKm: 2444,
    ...over,
  };
}

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

function answerFor(days: readonly AvailabilityDayRecord[], total = 765): AvailabilityAnswer {
  return {
    train: { no: "12627", name: "KARNATAKA EXP", fromName: "KSR Bengaluru", toName: "New Delhi", distanceKm: 2444 },
    fare: { base: total, reservation: 0, superfast: 0, gst: 0, total },
    days,
    retrievedAt: "2026-10-16T08:39:00.000Z",
  };
}

function row(over: Partial<TrainRow> = {}): TrainRow {
  return {
    train: train(),
    answers: { SL: answerFor([day({ status: "WL", wlBooking: 136, wlCurrent: 44 })], 765) },
    pending: ["3A", "2A"],
    notCarried: [],
    notBookable: false,
    beyondCap: false,
    failed: false,
    ...over,
  };
}

function plate(rows: readonly TrainRow[]): RouteAvailabilityAnswer {
  return { from: "SBC", to: "NDLS", journeyDate: "2026-10-16", leadClass: "SL", rows, retrievedAt: "14:09" };
}

function draw(rows: readonly TrainRow[], extra: { readonly sampleData?: boolean } = {}) {
  render(<TrainsPlate answer={plate(rows)} refusal={null} sampleData={extra.sampleData ?? false} quota="GN" />);
}

describe("the route's trains", () => {
  it("leads a class block with the answer and follows with the price", () => {
    draw([row()]);
    const block = screen.getByTestId("class-block");
    // "Will I get on" is asked before "what does it cost". An earlier draft had the fare as the
    // headline, which put the second question above the first.
    const [answer, price] = [...block.children];
    expect(within(answer as HTMLElement).getByText("WL")).toBeInTheDocument();
    expect(answer).toHaveTextContent("44/136");
    expect(price).toHaveTextContent("SL");
    expect(price).toHaveTextContent("₹765");
  });

  it("colours a queue amber however long it is, because the colour is not a forecast", () => {
    draw([
      row({ answers: { SL: answerFor([day({ status: "WL", wlBooking: 136, wlCurrent: 9 })]) } }),
      row({ train: train({ trainNo: "12647" }), answers: { SL: answerFor([day({ status: "WL", wlBooking: 136, wlCurrent: 148 })]) } }),
    ]);
    for (const chip of screen.getAllByText("WL")) expect(chip).toHaveClass("bg-queued-soft");
  });

  it("names the classes a row has not asked for", () => {
    draw([row()]);
    expect(screen.getByText("3A, 2A not asked yet")).toBeInTheDocument();
  });

  it("says nothing about classes when every chosen one is in hand", () => {
    draw([row({ pending: [] })]);
    expect(screen.queryByText(/not asked yet/)).not.toBeInTheDocument();
  });

  it("shows a refusal where a failed train's block would go, never an absent one", () => {
    draw([row({ answers: {}, failed: true })]);
    // An absent block reads as "no berths". The row keeps its facts and says it could not ask.
    expect(screen.queryByTestId("class-block")).not.toBeInTheDocument();
    expect(screen.getByText(/could not answer/i)).toBeInTheDocument();
    expect(screen.getByText("12627")).toBeInTheDocument();
  });

  it("lists a train the cap stopped it asking, and says it did not ask", () => {
    draw([row({ answers: {}, beyondCap: true, pending: ["SL", "3A", "2A"] })]);
    expect(screen.queryByTestId("class-block")).not.toBeInTheDocument();
    expect(screen.getByText("SL, 3A, 2A not asked yet")).toBeInTheDocument();
    // Not asked is not the same as failed, and must not borrow its words.
    expect(screen.queryByText(/could not answer/i)).not.toBeInTheDocument();
  });

  it("counts a train's running days without ever naming one", () => {
    draw([row({ train: train({ runsOn: [true, false, true, false, false, false, false] }) })]);
    expect(screen.getByText(/Runs 2 days a week/)).toBeInTheDocument();
    for (const weekday of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      expect(screen.queryByText(new RegExp(weekday))).not.toBeInTheDocument();
    }
  });

  it("says booking is closed on the card, because WAITLIST alone reads as joinable", () => {
    draw([row({ answers: { SL: answerFor([day({ status: "WL", wlBooking: 136, wlCurrent: 44, canBook: false })]) } })]);
    // `canBook` outranks the status word — production answered canBook false for a date twenty-one
    // days out. Neither the word nor its colour carries that, so the card has to.
    expect(within(screen.getByTestId("class-block")).getByText("Booking closed")).toBeInTheDocument();
  });

  it("shows the berths a day actually has, where the source published a count", () => {
    draw([row({ answers: { SL: answerFor([day({ status: "AVAILABLE", seats: 42 })]) } })]);
    // Forty-two free and one free are different worlds. This is a number the railway published —
    // unlike `prediction`, which is the source's own guess and is never shown.
    expect(within(screen.getByTestId("class-block")).getByText("42 free")).toBeInTheDocument();
  });

  it("spends no line on a history it cannot show yet", () => {
    draw([row()]);
    // `availability_observations.outcome` is written by nothing yet. The card used to say so on
    // every class of every train — sixteen times on a five-train list — which cost more room than
    // the sentence was worth. It returns when there is a number to put there.
    expect(screen.queryByText("Not enough history yet")).not.toBeInTheDocument();
  });

  it("renders a refusal and no list at all", () => {
    render(
      <TrainsPlate
        answer={null}
        refusal={{ ok: false, code: "SOURCE_UNAVAILABLE", message: "The reservation service could not answer." }}
        sampleData={false}
        quota="GN"
      />,
    );
    expect(screen.queryByTestId("train-row")).not.toBeInTheDocument();
    expect(screen.getByText("The reservation service could not answer.")).toBeInTheDocument();
  });

  it("drops a stale list the moment a search refuses", () => {
    // The page holds the last answer in state. If a new search refuses and the old rows survive,
    // the reader is looking at berths from a question they no longer asked — and nothing on the
    // page says so. The refusal wins over an answer that is still in hand.
    render(
      <TrainsPlate
        answer={plate([row()])}
        refusal={{ ok: false, code: "RATE_LIMITED", message: "Too many searches just now." }}
        sampleData={false}
        quota="GN"
      />,
    );
    expect(screen.queryByTestId("train-row")).not.toBeInTheDocument();
    expect(screen.getByText("Too many searches just now.")).toBeInTheDocument();
  });

  it("says a pair has no trains rather than drawing an empty list", () => {
    draw([]);
    expect(screen.queryByTestId("train-row")).not.toBeInTheDocument();
    expect(screen.getByText(/No trains run SBC → NDLS/)).toBeInTheDocument();
  });

  it("says so when the answer is sample data", () => {
    draw([row()], { sampleData: true });
    expect(screen.getByText("Sample data")).toBeInTheDocument();
  });
});
