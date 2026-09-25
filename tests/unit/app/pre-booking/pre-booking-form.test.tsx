import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreBookingForm } from "@/app/(site)/pre-booking/pre-booking-form";
import { messages } from "@/messages";

// Form TL-02 after the redraw: stations first, the train chosen from what that route answers.
//
// The route lookup is debounced and costs a provider request, so most of what is worth pinning here
// is about NOT asking — before a pair is readable, and again before a train and a date are chosen.

// 06:30 UTC on 17 September 2026 is midday IST, so "today" in IST is 2026-09-17.
const NOW = new Date("2026-09-17T06:30:00.000Z");

const m = messages.booking;
const train = () => screen.getByLabelText(m.train.label) as HTMLSelectElement;
const dateInput = () => screen.getByLabelText(m.date);
const checkButton = () => screen.getByRole("button", { name: m.submit });
const lifecycle = () => within(screen.getByRole("list", { name: m.lifecycle })).getAllByRole("listitem");

const TRAINS = [
  { trainNo: "12627", trainName: "KARNATAKA EXP", fromCode: "SBC", fromName: "SBC", toCode: "NDLS", toName: "NDLS", originCode: "SBC", originName: "SBC", destinationCode: "NDLS", destinationName: "NDLS", departs: "20:00", arrives: "06:10", travelTime: "34:10 hrs", runningDays: "1111111", runsOn: null, halts: 31, distanceKm: 2444 },
];

/** The route endpoint, answering with whatever this test needs. Nothing else is ever fetched here. */
function stubRoute(trains: unknown[]): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, trains, sampleData: true }) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The real debounce elapses here: waitFor polls on its own clock, and faking setTimeout stalls it. */
const settle = (ms = 350) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

/** Types a pair and lets the debounce elapse, which is the only thing that spends a request. */
async function enterPair(from = "SBC", to = "NDLS"): Promise<void> {
  fireEvent.change(screen.getByLabelText(m.from), { target: { value: from } });
  fireEvent.change(screen.getByLabelText(m.to), { target: { value: to } });
  await settle();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PreBookingForm", () => {
  it("draws Form TL-02 with the drawn options and nothing it can ask yet", () => {
    stubRoute([]);
    render(<PreBookingForm />);
    expect(screen.getByRole("heading", { level: 2, name: m.form.title })).toBeInTheDocument();
    expect(screen.getByText(m.form.sheet)).toBeInTheDocument();

    expect(train()).toBeDisabled();
    expect(train().options[0]?.textContent).toBe(m.train.waiting);
    expect(checkButton()).toBeDisabled();
    expect((screen.getByLabelText(m.cls) as HTMLSelectElement).value).toBe("3A");
    expect((screen.getByLabelText(m.quota) as HTMLSelectElement).value).toBe("GN");
  });

  it("asks for a route only once both codes read like codes", async () => {
    const fetchMock = stubRoute(TRAINS);
    render(<PreBookingForm />);

    fireEvent.change(screen.getByLabelText(m.from), { target: { value: "S" } });
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();

    await enterPair();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/trains?from=SBC&to=NDLS");
  });

  it("offers the route's trains and still refuses to check without a date", async () => {
    stubRoute(TRAINS);
    render(<PreBookingForm />);
    await enterPair();

    await waitFor(() => expect(train()).toBeEnabled());
    expect(train().options).toHaveLength(1);
    expect(train().value).toBe("12627");
    expect(checkButton()).toBeDisabled();

    fireEvent.change(dateInput(), { target: { value: "2026-09-17" } });
    expect(checkButton()).toBeEnabled();
  });

  it("says a pair has no trains, and keeps the check closed", async () => {
    stubRoute([]);
    render(<PreBookingForm />);
    await enterPair("SBC", "XXXX");

    await waitFor(() => expect(screen.getAllByText(m.route.none("SBC", "XXXX")).length).toBeGreaterThan(0));
    expect(train()).toBeDisabled();
    expect(checkButton()).toBeDisabled();
    expect(screen.getByLabelText(m.to)).toHaveAttribute("aria-invalid", "true");
  });

  it("refuses a past date in IST and says which dates are allowed", async () => {
    stubRoute(TRAINS);
    render(<PreBookingForm />);
    await enterPair();
    await waitFor(() => expect(train()).toBeEnabled());

    fireEvent.change(dateInput(), { target: { value: "2026-09-16" } });
    expect(screen.getByText(m.pastDate)).toBeInTheDocument();
    expect(dateInput()).toHaveAttribute("aria-invalid", "true");
    expect(checkButton()).toBeDisabled();

    fireEvent.change(dateInput(), { target: { value: "2026-09-17" } });
    expect(screen.queryByText(m.pastDate)).not.toBeInTheDocument();
    expect(checkButton()).toBeEnabled();
  });

  it("walks the lifecycle from waiting for a route to a train resolved", async () => {
    stubRoute(TRAINS);
    render(<PreBookingForm />);

    const before = lifecycle();
    expect(before).toHaveLength(4);
    expect(before[1]).toHaveAttribute("data-state", "pending");

    await enterPair();
    await waitFor(() => expect(lifecycle()[1]).toHaveAttribute("data-state", "done"));
    expect(within(lifecycle()[1]!).getByText(m.stepStates.chosen("KARNATAKA EXP", "SBC", "NDLS"))).toBeInTheDocument();
  });

  it("marks the train stop failed when the pair has no trains", async () => {
    stubRoute([]);
    render(<PreBookingForm />);
    await enterPair("SBC", "XXXX");

    await waitFor(() => expect(lifecycle()[1]).toHaveAttribute("data-state", "failed"));
    expect(lifecycle()[2]).toHaveAttribute("data-state", "pending");
  });
});
