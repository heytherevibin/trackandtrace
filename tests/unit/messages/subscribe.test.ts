import { describe, expect, it } from "vitest";
import { messages } from "@/messages";

// The boards are the authority. These are the strings a reader sees, checked here so a typo in a
// component cannot quietly change what was approved.
const m = messages.subscribe;

describe("the sign-up copy", () => {
  it("says what the consent line says, and links the last two words", () => {
    expect(m.form.consent.text).toBe("One email to confirm. Unsubscribe in one click. We never sell your address. ");
    expect(m.form.consent.link).toBe("Privacy notice");
  });

  it("names the button per place, and while sending", () => {
    expect(m.form.subscribe).toBe("Subscribe");
    expect(m.form.notify).toBe("Notify me");
    expect(m.form.sending).toBe("Sending…");
  });

  it("carries each place's own words", () => {
    expect(m.places.footerColumn).toBe("Updates by email");
    expect(m.places.preBooking).toBe("Tell me once when availability checks open. One email, nothing else.");
  });

  it("asks about the right press after someone unsubscribes", () => {
    // The spec said "Subscribed by mistake?", which asks about the wrong one: whoever reads this
    // has just left. The owner changed it at the B4 review, 2026-09-30.
    expect(m.page.unsubscribe.changedMind).toBe("Changed your mind?");
  });

  it("maps every offered reason to a value the API accepts", () => {
    // The labels read as sentences; the database takes four fixed values. A map that drifted would
    // send a reason the route's enum refuses, and the traveller would see "didn't go through" for
    // a button that is meant to be optional.
    expect(m.page.unsubscribe.reasons.map((r) => r.value)).toEqual(["too many", "not relevant", "did not sign up", "other"]);
    expect(m.page.unsubscribe.reasons.map((r) => r.label)).toEqual(["Too many emails", "Not relevant", "I didn't sign up", "Other"]);
  });
});
