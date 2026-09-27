import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import {
  MOTION_BOOT_SCRIPT,
  MOTION_STORAGE_KEY,
  QUALITY_STORAGE_KEY,
  REDUCED_DATA_QUERY,
  REDUCED_MOTION_QUERY,
  resolveDrawing,
  resolveMotion,
  resolveSaver,
  type ConnectionHint,
} from "@/components/motion/motion-boot";

// The script runs in <head> before any module, so it cannot import the resolvers: it restates them. These tests
// run the real string against a stand-in page and hold the two to the same answers.

interface StandIn {
  readonly stored: string | null;
  readonly reduced: boolean;
  readonly storageThrows?: boolean;
  readonly noMatchMedia?: boolean;
  readonly connection?: ConnectionHint;
  readonly reducedData?: boolean;
  readonly quality?: string | null;
  readonly sessionThrows?: boolean;
}

/** Runs MOTION_BOOT_SCRIPT against a stand-in page and returns what it wrote on <html>. */
function boot({ stored, reduced, storageThrows = false, noMatchMedia = false, connection, reducedData = false, quality = null, sessionThrows = false }: StandIn): ReadonlyMap<string, string> {
  const written = new Map<string, string>();
  runInNewContext(MOTION_BOOT_SCRIPT, {
    localStorage: {
      getItem: (key: string) => {
        if (storageThrows) throw new Error("SecurityError: site data is blocked");
        return key === MOTION_STORAGE_KEY ? stored : null;
      },
    },
    sessionStorage: {
      getItem: (key: string) => {
        if (sessionThrows) throw new Error("SecurityError: site data is blocked");
        return key === QUALITY_STORAGE_KEY ? quality : null;
      },
    },
    navigator: connection ? { connection } : {},
    window: noMatchMedia ? {} : { matchMedia: (query: string) => ({ matches: (query === REDUCED_MOTION_QUERY && reduced) || (query === REDUCED_DATA_QUERY && reducedData) }) },
    document: { documentElement: { setAttribute: (name: string, value: string) => written.set(name, value) } },
  });
  return written;
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
    expect(boot({ stored, reduced }).get("data-motion")).toBe(expected);
  });

  it("still decides when storage throws (blocked site data)", () => {
    expect(boot({ stored: "off", reduced: false, storageThrows: true }).get("data-motion")).toBe("on");
    expect(boot({ stored: null, reduced: true, storageThrows: true }).get("data-motion")).toBe("off");
  });

  it("still decides without matchMedia", () => {
    expect(boot({ stored: "off", reduced: false, noMatchMedia: true }).get("data-motion")).toBe("off");
    expect(boot({ stored: null, reduced: false, noMatchMedia: true }).get("data-motion")).toBe("on");
  });
});

const SAVER = [
  [undefined, false, "off"],
  [{ saveData: true }, false, "on"],
  [{ effectiveType: "slow-2g" }, false, "on"],
  [{ effectiveType: "2g" }, false, "on"],
  [{ effectiveType: "3g" }, false, "on"],
  [{ effectiveType: "4g" }, false, "off"],
  [{ saveData: false, effectiveType: "4g" }, true, "on"],
] as const;

describe("resolveSaver", () => {
  it.each(SAVER)("connection %o, reduced data %s: %s", (connection, reducedData, expected) => {
    expect(resolveSaver(connection, reducedData)).toBe(expected);
  });
});

describe("resolveDrawing", () => {
  it("draws live unless Motion is off, Data Saver is on, or this session fell to the floor", () => {
    expect(resolveDrawing("on", "off", null)).toBe("live");
    expect(resolveDrawing("off", "off", null)).toBe("still");
    expect(resolveDrawing("on", "on", null)).toBe("still");
    expect(resolveDrawing("on", "off", "still")).toBe("still");
    expect(resolveDrawing("on", "off", "2")).toBe("live");
  });
});

describe("MOTION_BOOT_SCRIPT's saver and drawing", () => {
  it.each(SAVER)("writes what resolveSaver decides: connection %o, reduced data %s", (connection, reducedData, expected) => {
    expect(boot({ stored: null, reduced: false, connection, reducedData }).get("data-saver")).toBe(expected);
  });

  it("writes what resolveDrawing decides", () => {
    expect(boot({ stored: null, reduced: false }).get("data-drawing")).toBe("live");
    expect(boot({ stored: "off", reduced: false }).get("data-drawing")).toBe("still");
    expect(boot({ stored: null, reduced: true }).get("data-drawing")).toBe("still");
    expect(boot({ stored: null, reduced: false, connection: { saveData: true } }).get("data-drawing")).toBe("still");
    expect(boot({ stored: null, reduced: false, quality: "still" }).get("data-drawing")).toBe("still");
  });

  it("still decides when session storage throws, or the page has no Network Information", () => {
    expect(boot({ stored: null, reduced: false, sessionThrows: true }).get("data-drawing")).toBe("live");
    expect(boot({ stored: null, reduced: false }).get("data-saver")).toBe("off");
  });
});
