import { describe, expect, it } from "vitest";
import { serviceEstimate } from "@/components/ui/service-estimate";

// ---------------------------------------------------------------------------
// Which of the reservation service's own numbers is an ESTIMATE, and which is
// the status said twice.
//
// Counted in the live store on 2026-09-27, across 441 rows:
//
//   301 × "N% Chance"        an estimate, with its figure
//     2 × "Low Chance"       an estimate in words, and it still carries one (26, 25)
//    65 × "Available"        pct 100 on 65 bookable rows — the status, restated
//    73 × "No More Booking"  pct 0 on 73 rows, none of them bookable — likewise
//
// The rule reads what the service SAID, not what we infer from the figure: a
// number is shown only where the service called it a chance. That is the same
// principle `statusTone` is keyed on, and it fails safe — a form this app has
// never seen is not shown at all, rather than shown as a number we have misread.
// ---------------------------------------------------------------------------

describe("serviceEstimate", () => {
  it("shows the figure when the service calls it a chance", () => {
    expect(serviceEstimate({ prediction: "89% Chance", predictionPercentage: 89 })).toBe(89);
    expect(serviceEstimate({ prediction: "26% Chance", predictionPercentage: 26 })).toBe(26);
  });

  it("shows it when the chance is named in words, because it still carries a figure", () => {
    // `Low Chance` at 26% and 25%, both on bookable waitlisted rows. This is the
    // warning case — the one most worth showing — and an allow-list of `N% Chance`
    // alone would have dropped it silently.
    expect(serviceEstimate({ prediction: "Low Chance", predictionPercentage: 26 })).toBe(26);
  });

  it("hides the status restated as a number", () => {
    // 100 on a day with berths and 0 on a day that cannot be booked say nothing
    // the row does not already say, and a 100% beside AVAILABLE reads as a
    // forecast when it is an echo.
    expect(serviceEstimate({ prediction: "Available", predictionPercentage: 100 })).toBeNull();
    expect(serviceEstimate({ prediction: "No More Booking", predictionPercentage: 0 })).toBeNull();
  });

  it("hides a form it has never seen rather than guessing at it", () => {
    expect(serviceEstimate({ prediction: "Confirm Probable", predictionPercentage: 70 })).toBeNull();
    expect(serviceEstimate({ prediction: "", predictionPercentage: 70 })).toBeNull();
  });

  it("hides an estimate with no figure to show, and a figure with no words behind it", () => {
    expect(serviceEstimate({ prediction: "Low Chance", predictionPercentage: null })).toBeNull();
    expect(serviceEstimate({ prediction: null, predictionPercentage: 89 })).toBeNull();
    expect(serviceEstimate({ prediction: null, predictionPercentage: null })).toBeNull();
  });

  it("refuses a figure outside 0 to 100, because that is not a percentage", () => {
    expect(serviceEstimate({ prediction: "120% Chance", predictionPercentage: 120 })).toBeNull();
    expect(serviceEstimate({ prediction: "-5% Chance", predictionPercentage: -5 })).toBeNull();
  });
});
