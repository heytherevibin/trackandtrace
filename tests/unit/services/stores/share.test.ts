import { describe, expect, it, vi } from "vitest";
import { buildShareText, buildShareUrl, shareOrCopy } from "@/services/stores/share";
import { buildFixtureResult } from "@/services/sources/fixture";

const payload = { title: "t", text: "x", url: "https://x/pnr#2345678901" };

describe("share", () => {
  it("builds the url and a text that names the pnr, train, and status", () => {
    const out = buildFixtureResult("2345678903", new Date("2026-09-17T06:30:00.000Z"));
    if (!out.ok) throw new Error("expected ok");
    expect(buildShareUrl("https://x", "2345678903")).toBe("https://x/pnr#2345678903");
    expect(buildShareText(out.result)).toMatch(/234 567 8903.*RAC 1/);
  });
  it("uses the share sheet when available", async () => {
    const share = vi.fn(async () => undefined);
    expect(await shareOrCopy(payload, { share, canShare: () => true, clipboard: undefined as unknown as Clipboard })).toBe("shared");
    expect(share).toHaveBeenCalledWith(payload);
  });
  it("falls back to the clipboard, then reports failure", async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await shareOrCopy(payload, { share: undefined as unknown as Navigator["share"], canShare: undefined as unknown as Navigator["canShare"], clipboard: { writeText } as unknown as Clipboard })).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(payload.url);
    expect(await shareOrCopy(payload, { share: undefined as unknown as Navigator["share"], canShare: undefined as unknown as Navigator["canShare"], clipboard: undefined as unknown as Clipboard })).toBe("failed");
  });
});
