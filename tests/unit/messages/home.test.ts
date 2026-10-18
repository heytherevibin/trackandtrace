import { describe, expect, it } from "vitest";
import { messages } from "@/messages";

// The landing makes claims about what the product does today. This file pins the ones that have
// gone stale before, because a sentence that outlives its truth reads as a promise nobody kept.

const home = messages.home;


describe("the landing's claims about what is live", () => {
  it("marks live only what ships today: seat availability and fares (pre-booking)", () => {
    expect(home.roadmap.items.filter((i) => i.status === "live").map((i) => i.title)).toEqual(["Seat availability", "Fare enquiry"]);
  });

  it("promises no confirmation odds anywhere on the sheet", () => {
    expect(JSON.stringify(home)).not.toMatch(/chance of confirmation|likely to confirm|% chance/i);
  });
});
