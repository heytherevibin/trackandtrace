import { describe, expect, it } from "vitest";
import { statusTone } from "@/components/ui/status-tone";

// The status colour, which two surfaces draw and nothing tested directly until a WAITLIST came back
// GREEN on production (12601 and 16159, MAS → SRR, 2026-09-26).
//
// The rule it had inferred "queue" from a parsed NUMBER rather than from the status word, so a
// waitlist whose `rawStatus` did not split into `nn/nn` fell through to the open colour. Green on a
// queue is the one direction this product must never fail in: it says a berth is free.

const day = (over: Partial<Parameters<typeof statusTone>[0]> = {}) => ({ canBook: true, wlCurrent: null, status: "AVAILABLE", ...over });

describe("the status colour", () => {
  it("is green only where the source actually said available", () => {
    expect(statusTone(day({ status: "AVAILABLE" })).chip).toContain("open");
  });

  it("is amber for a waitlist even when no queue figure could be read", () => {
    // The production case. `splitRawStatus` returns nulls for every form that is not a pair — which
    // is normal, not an error — so the absence of a number says nothing about whether there is a
    // queue. Only the status word does.
    expect(statusTone(day({ status: "WAITLIST", wlCurrent: null })).chip).toContain("queued");
    expect(statusTone(day({ status: "WAITLIST", wlCurrent: 31 })).chip).toContain("queued");
  });

  it("is amber for RAC, which is a seat in a queue and not a berth", () => {
    expect(statusTone(day({ status: "RAC", wlCurrent: null })).chip).toContain("queued");
  });

  it("is amber for a status it has never seen, rather than green", () => {
    // The status is a free string from the provider. An unknown one must fail towards "queue":
    // reading it as an open berth is the mistake a traveller acts on.
    expect(statusTone(day({ status: "SOMETHING NEW" })).chip).toContain("queued");
  });

  it("never reads NOT AVAILABLE as available, the way the berth-count regex never does", () => {
    expect(statusTone(day({ status: "NOT AVAILABLE" })).chip).not.toContain("open");
  });

  it("is closed whenever the source will not sell it, whatever the word says", () => {
    // `canBook` outranks everything: production answered AVAILABLE with canBook false.
    expect(statusTone(day({ status: "AVAILABLE", canBook: false })).chip).toContain("closed");
    expect(statusTone(day({ status: "WAITLIST", canBook: false, wlCurrent: 44 })).chip).toContain("closed");
  });

  it("gives a queue of 9 and a queue of 148 the same amber", () => {
    // A colour that eased towards green as the queue shortened would be a prediction, and this
    // product does not make one. The figure beside the chip does the ranking.
    expect(statusTone(day({ status: "WAITLIST", wlCurrent: 9 }))).toEqual(statusTone(day({ status: "WAITLIST", wlCurrent: 148 })));
  });
});
