import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { MOTION_BOOT_SCRIPT, MOTION_STORAGE_KEY, REDUCED_MOTION_QUERY, resolveMotion } from "@/components/motion/motion-boot";

// The script runs in <head> before any module, so it cannot import resolveMotion: it restates it. These tests
// run the real string against a stand-in page and hold the two to the same answers.

interface StandIn {
  readonly stored: string | null;
  readonly reduced: boolean;
  readonly storageThrows?: boolean;
  readonly noMatchMedia?: boolean;
}

/** Runs MOTION_BOOT_SCRIPT against a stand-in page and returns what it wrote to <html data-motion>. */
function boot({ stored, reduced, storageThrows = false, noMatchMedia = false }: StandIn): string | undefined {
  const written = new Map<string, string>();
  runInNewContext(MOTION_BOOT_SCRIPT, {
    localStorage: {
      getItem: (key: string) => {
        if (storageThrows) throw new Error("SecurityError: site data is blocked");
        return key === MOTION_STORAGE_KEY ? stored : null;
      },
    },
    window: noMatchMedia ? {} : { matchMedia: (query: string) => ({ matches: query === REDUCED_MOTION_QUERY && reduced }) },
    document: { documentElement: { setAttribute: (name: string, value: string) => written.set(name, value) } },
  });
  return written.get("data-motion");
}

const CASES = [
  [null, false, "on"],
  ["off", false, "off"],
  ["on", false, "on"],
  ["anything else", false, "on"],
  [null, true, "off"],
  ["off", true, "off"],
] as const;

describe("resolveMotion", () => {
  it.each(CASES)("stored %s, device reduced %s: %s", (stored, reduced, expected) => {
    expect(resolveMotion(stored, reduced)).toBe(expected);
  });
});

describe("MOTION_BOOT_SCRIPT", () => {
  it.each(CASES)("writes what resolveMotion decides: stored %s, device reduced %s", (stored, reduced, expected) => {
    expect(boot({ stored, reduced })).toBe(expected);
  });

  it("still decides when storage throws (blocked site data)", () => {
    expect(boot({ stored: "off", reduced: false, storageThrows: true })).toBe("on");
    expect(boot({ stored: null, reduced: true, storageThrows: true })).toBe("off");
  });

  it("still decides without matchMedia", () => {
    expect(boot({ stored: "off", reduced: false, noMatchMedia: true })).toBe("off");
    expect(boot({ stored: null, reduced: false, noMatchMedia: true })).toBe("on");
  });
});
