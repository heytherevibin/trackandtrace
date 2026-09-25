import { describe, expect, it } from "vitest";
import { availabilityBodySchema } from "@/app/api/availability/schema";
import { routeAvailabilityBodySchema } from "@/app/api/route-availability/schema";

// The two bodies the list surface posts. These are the boundary: past them, a class list is trusted
// to be a set, and a journey is trusted to name exactly one way of asking about its classes.

const SEARCH = { from: "SBC", to: "NDLS", journeyDate: "2026-10-16", quota: "GN", classes: ["SL", "3A", "2A"] };
const JOURNEY = { trainNo: "12627", from: "SBC", to: "NDLS", journeyDate: "2026-10-16", quota: "GN" };

describe("the search body", () => {
  it("takes a route, a date and the classes to lead with", () => {
    const parsed = routeAvailabilityBodySchema.safeParse(SEARCH);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.classes).toEqual(["SL", "3A", "2A"]);
  });

  it("de-duplicates classes before counting them", () => {
    // Eight entries, one class. A repeat must not be a way past the cap, because the cap is what
    // bounds how many requests one search can spend.
    const parsed = routeAvailabilityBodySchema.safeParse({ ...SEARCH, classes: Array.from({ length: 8 }, () => "SL") });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.classes).toEqual(["SL"]);
  });

  it("refuses more distinct classes than a search may spend", () => {
    const parsed = routeAvailabilityBodySchema.safeParse({ ...SEARCH, classes: ["SL", "3A", "2A", "1A", "CC", "EC", "2S", "3E"] });
    expect(parsed.success).toBe(false);
  });

  it("refuses a search that names no class", () => {
    expect(routeAvailabilityBodySchema.safeParse({ ...SEARCH, classes: [] }).success).toBe(false);
  });

  it("refuses a class it does not know", () => {
    expect(routeAvailabilityBodySchema.safeParse({ ...SEARCH, classes: ["SL", "ZZ"] }).success).toBe(false);
  });

  it("refuses anything it was not asked for", () => {
    expect(routeAvailabilityBodySchema.safeParse({ ...SEARCH, trainNo: "12627" }).success).toBe(false);
  });
});

describe("the journey body", () => {
  it("takes one class, as it always has", () => {
    const parsed = availabilityBodySchema.safeParse({ ...JOURNEY, travelClass: "3A" });
    expect(parsed.success).toBe(true);
  });

  it("takes a list of classes, for a row being opened", () => {
    const parsed = availabilityBodySchema.safeParse({ ...JOURNEY, travelClasses: ["3A", "2A"] });
    expect(parsed.success).toBe(true);
    // The union narrows: past the parse, a body with a list cannot also carry a single class.
    if (parsed.success && "travelClasses" in parsed.data) expect(parsed.data.travelClasses).toEqual(["3A", "2A"]);
  });

  it("refuses a body that names neither", () => {
    // Without one of them there is no question to ask, and a default would pick a class for
    // someone — spending a request on a berth they never said they wanted.
    expect(availabilityBodySchema.safeParse(JOURNEY).success).toBe(false);
  });

  it("refuses a body that names both", () => {
    expect(availabilityBodySchema.safeParse({ ...JOURNEY, travelClass: "SL", travelClasses: ["3A"] }).success).toBe(false);
  });

  it("de-duplicates a class list too", () => {
    const parsed = availabilityBodySchema.safeParse({ ...JOURNEY, travelClasses: ["3A", "3A", "2A"] });
    expect(parsed.success).toBe(true);
    // The union narrows: past the parse, a body with a list cannot also carry a single class.
    if (parsed.success && "travelClasses" in parsed.data) expect(parsed.data.travelClasses).toEqual(["3A", "2A"]);
  });
});
