import { describe, expect, it } from "vitest";
import { accuracy } from "@/messages/en-IN/accuracy";

// The ledger table left the accuracy page on 2026-09-18 (section 01 is now Service),
// so no line of the page's copy may point at it.

describe("accuracy copy", () => {
  it("never mentions the removed ledger", () => {
    expect(JSON.stringify(accuracy)).not.toMatch(/ledger/i);
  });
});
