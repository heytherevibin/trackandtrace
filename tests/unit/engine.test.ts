import { describe, it, expect } from "vitest";
import { isValidPnr, formatPnr, DEMO_PNRS } from "../../src/lib/engine";

describe("isValidPnr", () => {
  it("accepts valid 10-digit PNRs starting with 2-9", () => {
    expect(isValidPnr("2345678901")).toBe(true);
    expect(isValidPnr("9999999999")).toBe(true);
  });

  it("rejects PNRs starting with 0 or 1", () => {
    expect(isValidPnr("0123456789")).toBe(false);
    expect(isValidPnr("1234567890")).toBe(false);
  });

  it("rejects short inputs", () => {
    expect(isValidPnr("234567890")).toBe(false);
    expect(isValidPnr("")).toBe(false);
  });

  it("rejects inputs with non-digits", () => {
    expect(isValidPnr("234567890a")).toBe(false);
    expect(isValidPnr("23456789 1")).toBe(false);
  });
});

describe("formatPnr", () => {
  it("formats a 10-digit PNR as xxx xxx xxxx", () => {
    expect(formatPnr("2345678901")).toBe("234 567 8901");
  });

  it("handles partial input", () => {
    expect(formatPnr("234")).toBe("234");
    expect(formatPnr("234567")).toBe("234 567");
  });
});

describe("DEMO_PNRS", () => {
  it("has at least one demo PNR", () => {
    expect(Object.keys(DEMO_PNRS).length).toBeGreaterThanOrEqual(1);
  });

  it("all demo PNRs are valid", () => {
    for (const pnr of Object.keys(DEMO_PNRS)) {
      expect(isValidPnr(pnr)).toBe(true);
    }
  });
});
