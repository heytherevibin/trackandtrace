import { describe, expect, it } from "vitest";
import { cn } from "@/utils/cn";

describe("cn", () => {
  it("keeps a custom text size next to a text colour", () => {
    for (const size of ["text-2xs", "text-label", "text-body", "text-lead", "text-page", "text-hero", "text-signin"]) {
      expect(cn(size, "text-ink-3").split(" ")).toEqual([size, "text-ink-3"]);
      expect(cn("text-ink-3", size).split(" ")).toEqual(["text-ink-3", size]);
    }
  });
  it("still resolves two sizes and two colours", () => {
    expect(cn("text-label", "text-body")).toBe("text-body");
    expect(cn("text-ink-1", "text-accent-text")).toBe("text-accent-text");
  });
  it("keeps a custom tracking token", () => {
    expect(cn("tracking-caps", "text-label")).toBe("tracking-caps text-label");
  });
});
