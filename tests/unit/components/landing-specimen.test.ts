import { describe, expect, it } from "vitest";
import { buildSpecimen } from "@/components/landing/specimen-data";

describe("buildSpecimen", () => {
  it("draws the specimen from the labelled fixture generator, not from hand-written rows", () => {
    const specimen = buildSpecimen(new Date("2026-09-17T06:30:00.000Z"));
    expect(specimen).toEqual({
      leadTag: "Confirmed — lead passenger",
      trainLine: "12627 · Karnataka Express · SBC → NDLS",
      journeyLine: "Sat, 19 Sept · departs 19:20 IST · quota GN",
      pax: [
        { key: "1", name: "Passenger 1", booked: "WL", current: "CNF", alloc: "B1 · 12 LB" },
        { key: "2", name: "Passenger 2", booked: "WL", current: "RAC 4", alloc: "Not allocated" },
        { key: "3", name: "Passenger 3", booked: "WL", current: "WL 9", alloc: "Not allocated" },
      ],
      provenance: "Retrieved 12:00 IST from the development fixture · every field as returned, none invented",
      seats: { cls: "3A", coach: "B1", berth: "12 LB", status: "CNF", waiting: [{ index: 2, label: "RAC 4" }, { index: 3, label: "WL 9" }] },
    });
  });

  it("carries the lead passenger's seat for the berth plan, and who is still waiting", () => {
    const specimen = buildSpecimen(new Date("2026-09-17T06:30:00.000Z"))!;
    expect(specimen.seats).toEqual({ cls: "3A", coach: "B1", berth: "12 LB", status: "CNF", waiting: [{ index: 2, label: "RAC 4" }, { index: 3, label: "WL 9" }] });
  });
});
