import { describe, expect, it } from "vitest";
import { messages } from "@/messages";

// The landing makes claims about what the product does today. This file pins the ones that have
// gone stale before, because a sentence that outlives its truth reads as a promise nobody kept.

const home = messages.home;

describe("the landing's claims about pre-booking", () => {
  it("describes what a search does now, not what it will do when a source is connected", () => {
    // Availability has been live since the route seam shipped: `servingSampleData()` is true only
    // when PNR_SOURCE is the fixture, so a deployment with a provider key answers from inventory.
    // The old sentence — "it fills with live availability the day a timetable and inventory source
    // is connected" — outlived that by months, and after the roadmap gained per-item status it sat
    // two sections below a row marked Live.
    expect(home.features.preBooking.detail).toBe(
      "Plan a journey before you book. Pick the stations, a date and the classes you would travel in, and every train on the route answers at once — open berths and the fare, four dates at a time.",
    );
  });

  it("agrees with the pre-booking page's own lead about what one search answers", () => {
    // Two surfaces describing one feature drift apart quietly. Both say a search answers every
    // train on the route; if one is reworded, this fails rather than the pair silently disagreeing.
    expect(messages.booking.lead).toContain("Every train on that route answers at once");
    expect(home.features.preBooking.detail).toContain("every train on the route answers at once");
  });

  it("promises only the window the plate actually returns", () => {
    // The plate says "Four dates come back at a time"; the landing must not imply more.
    expect(messages.booking.availability.window).toBe("Four dates come back at a time.");
    expect(home.features.preBooking.detail).toContain("four dates at a time");
  });
});
