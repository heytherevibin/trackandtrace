import { describe, expect, it } from "vitest";
import { PNR_INVALID_MESSAGE, formatPnr, isValidPnr, normalizePnr, pnrInText, pnrSchema } from "@/utils/pnr";

describe("normalizePnr", () => {
  it("strips non-digits and caps at 10", () => {
    expect(normalizePnr(" 234-567 8901x9 ")).toBe("2345678901");
  });
});

describe("pnrInText", () => {
  it.each([
    ["2345678900", "2345678900"],
    ["  2345678900\n", "2345678900"],
    ["234 567 8900", "2345678900"],
    ["234-567-8900", "2345678900"],
    ["PNR: 2345678900", "2345678900"],
    ["PNR:2345678900,TRN:12951,DOJ:17-09-26,SCH DEP:17:00,3A,BCT-NDLS", "2345678900"],
    ["Train 12951 departs 17:00. PNR No. 234-567-8900. Helpline 1234567890", "2345678900"],
  ])("finds the whole PNR in %j", (text, pnr) => {
    expect(pnrInText(text)).toBe(pnr);
  });

  it.each(["", "12951", "234567", "23456789012", "abc", "234 567 89"])("finds no whole PNR in %j", (text) => {
    expect(pnrInText(text)).toBeNull();
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

describe("result links keep the PNR after #", () => {
  it("builds /pnr#<pnr>, which browsers never send to a server", async () => {
    const { pnrHref } = await import("@/utils/pnr");
    expect(pnrHref("2345678901")).toBe("/pnr#2345678901");
  });

  it("reads the PNR back from the hash, tolerating grouping, and nothing else", async () => {
    const { pnrFromHash } = await import("@/utils/pnr");
    expect(pnrFromHash("#2345678901")).toBe("2345678901");
    expect(pnrFromHash("#234-567-8901")).toBe("2345678901");
    expect(pnrFromHash("#234%20567%208901")).toBe("2345678901");
    for (const bad of ["", "#", "#abc", "#123", "#23456789012", "#%E0%A4%A"]) expect(pnrFromHash(bad)).toBeNull();
  });
});
