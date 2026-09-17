import { describe, expect, it, vi } from "vitest";
import { log, redact } from "@/services/log";

describe("redact", () => {
  it("masks every ten-digit run", () => {
    const out = redact("PNR 2345678901 and 9876543210 failed");
    expect(out).not.toMatch(/\d{10}/);
    expect(out).toContain("23••••••01");
  });
  it("leaves shorter numbers alone", () => {
    expect(redact("train 12951 at 17:00")).toBe("train 12951 at 17:00");
  });
});

describe("log", () => {
  it("never writes a ten-digit run to the console", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    log.error("lookup failed for 2345678901", { pnr: "2345678901", nested: ["1234567890"] });
    const printed = JSON.stringify(spy.mock.calls);
    expect(printed).not.toMatch(/\d{10}/);
    spy.mockRestore();
  });
});
