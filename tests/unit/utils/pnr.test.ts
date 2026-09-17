import { describe, expect, it } from "vitest";
import { PNR_INVALID_MESSAGE, formatPnr, isValidPnr, normalizePnr, pnrSchema } from "@/utils/pnr";

describe("normalizePnr", () => {
  it("strips non-digits and caps at 10", () => {
    expect(normalizePnr(" 234-567 8901x9 ")).toBe("2345678901");
  });
});

describe("isValidPnr", () => {
  it("accepts exactly 10 digits", () => {
    expect(isValidPnr("2345678901")).toBe(true);
    expect(isValidPnr("0123456789")).toBe(true);
  });
  it("rejects 9 and 11 digits and letters", () => {
    expect(isValidPnr("234567890")).toBe(false);
    expect(isValidPnr("23456789012")).toBe(false);
    expect(isValidPnr("23456789ab")).toBe(false);
  });
});

describe("formatPnr", () => {
  it("groups as 3-3-4", () => {
    expect(formatPnr("2345678901")).toBe("234 567 8901");
  });
  it("formats partial input without trailing separators", () => {
    expect(formatPnr("2345")).toBe("234 5");
  });
});

describe("pnrSchema", () => {
  it("fails with the shared message", () => {
    const parsed = pnrSchema.safeParse("12");
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.message).toBe(PNR_INVALID_MESSAGE);
  });
  it("passes a valid PNR through unchanged", () => {
    expect(pnrSchema.parse("2345678901")).toBe("2345678901");
  });
});
