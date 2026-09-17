import { describe, expect, it } from "vitest";
import { statusDescription, statusLabel, toneForStatus } from "@/utils/status-tone";

describe("toneForStatus", () => {
  it("maps CNF to go, RAC and WL to watch, CANCELLED to stop, else neutral", () => {
    expect(toneForStatus("CNF")).toBe("go");
    expect(toneForStatus("RAC")).toBe("watch");
    expect(toneForStatus("WL")).toBe("watch");
    expect(toneForStatus("CANCELLED")).toBe("stop");
    expect(toneForStatus("NOT_FOUND")).toBe("neutral");
  });
});

describe("statusLabel", () => {
  it("adds the position for RAC and WL only", () => {
    expect(statusLabel("RAC", 12)).toBe("RAC 12");
    expect(statusLabel("WL", 34)).toBe("WL 34");
    expect(statusLabel("CNF", null)).toBe("Confirmed");
    expect(statusLabel("WL", null)).toBe("Waitlist");
  });
  it("describes every status in plain language", () => {
    for (const s of ["CNF", "RAC", "WL", "CANCELLED", "NOT_FOUND"] as const) expect(statusDescription(s).length).toBeGreaterThan(10);
  });
});
