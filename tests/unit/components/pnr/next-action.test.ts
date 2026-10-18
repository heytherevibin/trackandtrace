import { describe, expect, it } from "vitest";
import { nextForFailure, nextForResult } from "@/components/pnr/next-action";
import type { PassengerSeat, PnrResult, TicketStatus } from "@/types/domain";

// v4's Next box (handoff: "one instruction per state", trakline-core.js lookup().next): what to do now, with the chart
// time in the source's own words. Nothing is predicted: "Dropped" needs the source to say the chart is prepared.

const NOW = new Date("2026-10-18T06:00:00Z");

function seat(index: number, currentStatus: TicketStatus, position?: number): PassengerSeat {
  return { index, bookingStatus: "WL", currentStatus, position } as PassengerSeat;
}

function result(pax: PassengerSeat[], snapshot: Partial<PnrResult["snapshot"]> = {}): PnrResult {
  const lead = pax[0]!;
  return {
    snapshot: { pax, passengerCount: pax.length, chartAt: "2026-10-18T09:30:00Z", chartTime: "15:00", ...snapshot },
    lead: { status: lead.currentStatus, position: lead.position ?? null },
  } as unknown as PnrResult;
}

describe("nextForResult", () => {
  it("tells a waitlisted ticket to re-check before the chart, with the chart's time and the countdown", () => {
    const n = nextForResult(result([seat(1, "WL", 18)]), NOW);
    expect(n.head).toBe("Chart in");
    expect(n.big).toBe("3 h 30 min");
    expect(n.text).toBe("Save and re-check before 15:00 IST, when the first chart decides this ticket.");
    expect(n.quiet).toBe(false);
  });

  it("names how many in a party are still waiting", () => {
    const n = nextForResult(result([seat(1, "CNF"), seat(2, "RAC", 12), seat(3, "WL", 7)]), NOW);
    expect(n.text).toBe("Save and re-check before 15:00 IST, when the first chart decides the two still waiting.");
  });

  it("has nothing more to do for a confirmed ticket", () => {
    const n = nextForResult(result([seat(1, "CNF")]), NOW);
    expect(n.text).toBe("Nothing more to do. Save the PNR to re-check coach and berth before boarding.");
    expect(n.big).toBe("3 h 30 min");
  });

  it("is final once the source says the chart is prepared", () => {
    const n = nextForResult(result([seat(1, "CNF")], { chartPrepared: true, chartAt: "2026-10-18T05:00:00Z" }), NOW);
    expect(n).toMatchObject({ head: "Chart prepared", big: "Final", text: "The chart is final. Save the PNR if you want the record on this device." });
  });

  it("reads Dropped only when the source says the chart is prepared and a passenger is still waiting", () => {
    const n = nextForResult(result([seat(1, "WL", 4)], { chartPrepared: true }), NOW);
    expect(n).toMatchObject({ head: "Chart prepared · not confirmed", big: "Dropped", quiet: true });
    expect(n.text).toBe("A refund follows the railway's rules for a waitlisted ticket. Nothing further changes here.");
    expect(n.long).toBe("The chart is prepared and this ticket stayed waitlisted. It is not valid for travel.");
    const party = nextForResult(result([seat(1, "CNF"), seat(2, "WL", 3), seat(3, "WL", 9)], { chartPrepared: true }), NOW);
    expect(party.long).toBe("The chart is prepared and two of three stayed waitlisted. Those passengers cannot travel on this ticket.");
  });

  it("never calls a ticket dropped from the clock alone", () => {
    const n = nextForResult(result([seat(1, "WL", 4)], { chartAt: "2026-10-18T05:00:00Z" }), NOW);
    expect(n.big).not.toBe("Dropped");
  });

  it("has nothing to watch on a cancelled ticket", () => {
    const n = nextForResult(result([seat(1, "CANCELLED")]), NOW);
    expect(n).toMatchObject({ head: "Next", big: null, quiet: true, text: "Nothing to watch. If you did not cancel this ticket, contact the booking channel." });
  });

  it("gives no countdown where the source sent no chart time", () => {
    const n = nextForResult(result([seat(1, "WL", 2)], { chartAt: undefined, chartTime: undefined }), NOW);
    expect(n).toMatchObject({ head: "Next", big: null });
    expect(n.text).toBe("Save the PNR and re-check as the chart approaches.");
  });
});

describe("nextForFailure", () => {
  it("says what to do for each failure", () => {
    expect(nextForFailure("notfound")).toBe("Compare the ten digits with the top-left of your ticket, then run again.");
    expect(nextForFailure("unavailable")).toBe("Run the check again in a minute. Nothing has been assumed about this ticket.");
    expect(nextForFailure("limited", 60)).toBe("Retry in 60 s.");
    expect(nextForFailure("limited")).toBe("Retry in a minute.");
    expect(nextForFailure("refused")).toBe("Compare the ten digits with your ticket or booking SMS, then run again.");
  });
});
