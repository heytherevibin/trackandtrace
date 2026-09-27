import { describe, expect, it } from "vitest";
import { queueMovement } from "@/components/ui/queue-movement";

// ---------------------------------------------------------------------------
// The forms below are not invented. Every one was counted in the live store on
// 2026-09-27 across 433 rows, and the counts are given so a future reader knows
// which cases are the common ones and which are the edges:
//
//   156 × GNWLn/WLn      108 × PQWLn/WLn      27 × RLWLn/WLn       7 × TQWLn/WLn
//    37 × AVAILABLE-n     30 × NOT AVAILABLE  27 × REGRET         11 × TRAIN DEPARTED
//     9 × RAC  n/RAC  n    4 × GNWLn/RACn      4 × CLASS NOT EXIST 3 × AVAILABLE-n#
//     2 × CURR_AVBL-n      2 × PQWL/AVAILABLE  1 × CHARTING DONE *
//
// A form absent from that list is not tested as "should work"; it is tested as
// "must return null", because this function's whole job is to refuse to do
// arithmetic it cannot justify.
// ---------------------------------------------------------------------------

describe("queueMovement", () => {
  it("reads a same-queue waitlist pair as a queue that has already drained", () => {
    // The commonest form in the store. 65 were issued ahead of the next booking;
    // it now stands 26th, so 39 of them have gone.
    expect(queueMovement("GNWL65/WL26")).toEqual({ kind: "drained", opened: 65, now: 26, cleared: 39 });
  });

  it("reads every waitlist prefix the store has seen, because the prefix is the quota and not the shape", () => {
    expect(queueMovement("PQWL120/WL44")).toEqual({ kind: "drained", opened: 120, now: 44, cleared: 76 });
    expect(queueMovement("RLWL18/WL7")).toEqual({ kind: "drained", opened: 18, now: 7, cleared: 11 });
    expect(queueMovement("TQWL59/WL39")).toEqual({ kind: "drained", opened: 59, now: 39, cleared: 20 });
  });

  it("reads an RAC pair, whose spacing varies in the real data", () => {
    // `RAC  58/RAC  51` and `RAC   9/RAC   4` both occur: two spaces and three.
    expect(queueMovement("RAC  58/RAC  51")).toEqual({ kind: "drained", opened: 58, now: 51, cleared: 7 });
    expect(queueMovement("RAC   9/RAC   4")).toEqual({ kind: "drained", opened: 9, now: 4, cleared: 5 });
  });

  it("says nothing has cleared yet rather than hiding the queue, when both halves agree", () => {
    expect(queueMovement("GNWL9/WL9")).toEqual({ kind: "drained", opened: 9, now: 9, cleared: 0 });
  });

  // ---------------------------------------------------------------------------
  // The case this function exists for.
  // ---------------------------------------------------------------------------

  it("REFUSES to subtract across two different queues, and says the position improved instead", () => {
    // `GNWL5/RAC48` is issued at general waitlist 5 and now standing at RAC 48.
    // RAC is a BETTER state than waitlist — a shared seat rather than none — so
    // the two numbers are not on one scale. Subtracting them gives −43 "cleared",
    // which is what the live store returns for this form and what a naive
    // reading would have drawn on the page.
    expect(queueMovement("GNWL5/RAC48")).toEqual({ kind: "improved", to: "RAC", now: 48 });
    expect(queueMovement("GNWL2/RAC42")).toEqual({ kind: "improved", to: "RAC", now: 42 });
  });

  it("never returns a negative clearance, whatever it is given", () => {
    // The guard restated as an invariant, because one form breaking it is how
    // this was found and a second form breaking it would be silent.
    for (const raw of ["GNWL5/RAC48", "GNWL2/RAC42", "RAC 3/RAC 90", "GNWL1/WL400"]) {
      const move = queueMovement(raw);
      if (move?.kind === "drained") expect(move.cleared).toBeGreaterThanOrEqual(0);
    }
  });

  it("reads a queue that has cleared into availability, which carries no left-hand figure", () => {
    // `PQWL/AVAILABLE`: the pooled quota waitlist is gone and berths are free.
    // No number to subtract, and the best outcome a queue has.
    expect(queueMovement("PQWL/AVAILABLE")).toEqual({ kind: "cleared-out" });
  });

  // ---------------------------------------------------------------------------
  // Everything else is null, and null is a normal reading rather than a failure.
  // ---------------------------------------------------------------------------

  it("returns null for forms that carry no pair, because absence of a pair is normal", () => {
    for (const raw of [
      "AVAILABLE-0042",
      "AVAILABLE-0042#",
      "AVAILABLE 0042",
      "NOT AVAILABLE",
      "REGRET",
      "TRAIN DEPARTED",
      "TRAIN CANCELLED",
      "CHARTING DONE *",
      "CURR_AVBL-0048",
      "CLASS NOT EXIST",
      "RAC 12",
      "",
      "   ",
    ]) {
      expect(queueMovement(raw), raw).toBeNull();
    }
  });

  it("returns null rather than guessing when a position appears to have got worse", () => {
    // A held position cannot degrade from RAC back to waitlist: cancellations
    // only move a queue one way. A form saying otherwise is one this app has
    // misread, and the honest answer is to say nothing.
    expect(queueMovement("RAC5/WL48")).toBeNull();
  });
});
