import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConsoleDb } from "@/console/auth/db";
import { consoleAddressHash, consoleEnvironment, deviceLabel, nextAfterConfirm, startConsoleSession } from "@/console/auth/session";
import { resetEnvCache } from "@/services/env";

const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const FIREFOX_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0";

// A real 32-byte key, matching the DATA_KEY regex in src/services/env.ts -- not the brief's literal
// (`c2VjcmV0LXNlY3JldC1zZWNyZXQtc2VjcmV0LTMyIQ==`), which decodes to 31 bytes and so fails that
// regex; env() then silently drops it outside production, and both calls below would collapse to
// the no-DATA_KEY constant "local", failing "tells two addresses apart". This is the same fixture
// shape tests/unit/services/data-key.test.ts already uses for the same reason.
const DATA_KEY = Buffer.alloc(32, 7).toString("base64");

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("deviceLabel", () => {
  it("names the browser and the system, as the audit log shows it", () => {
    expect(deviceLabel(CHROME_MAC)).toBe("Chrome on macOS");
    expect(deviceLabel(SAFARI_IPHONE)).toBe("Safari on iOS");
    expect(deviceLabel(FIREFOX_WINDOWS)).toBe("Firefox on Windows");
  });

  it("always answers something the column will take", () => {
    expect(deviceLabel(null)).toBe("Unknown device");
    expect(deviceLabel("")).toBe("Unknown device");
    expect(deviceLabel("x".repeat(500)).length).toBeLessThanOrEqual(120);
  });
});

describe("consoleAddressHash", () => {
  it("is one-way, stable and short enough for the column", () => {
    vi.stubEnv("DATA_KEY", DATA_KEY);
    resetEnvCache();
    const hash = consoleAddressHash("203.0.113.9");
    expect(hash).toBe(consoleAddressHash("203.0.113.9"));
    expect(hash).not.toContain("203.0.113");
    expect(hash.length).toBeLessThanOrEqual(128);
    expect(hash.length).toBeGreaterThan(0);
  });

  it("tells two addresses apart", () => {
    vi.stubEnv("DATA_KEY", DATA_KEY);
    resetEnvCache();
    expect(consoleAddressHash("203.0.113.9")).not.toBe(consoleAddressHash("203.0.113.10"));
  });

  it("still answers without DATA_KEY, which only a local run lacks", () => {
    expect(consoleAddressHash("203.0.113.9")).toBe("local");
  });
});

describe("nextAfterConfirm", () => {
  it("sends a member with fewer than two keys to Setup", () => {
    expect(nextAfterConfirm(0)).toBe("/setup");
    expect(nextAfterConfirm(1)).toBe("/setup");
  });

  it("sends a member with two keys to the key step", () => {
    expect(nextAfterConfirm(2)).toBe("/keys");
  });
});

describe("startConsoleSession", () => {
  it("opens the row under the JWT's own session id", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const db = { rpc } as unknown as ConsoleDb;
    await startConsoleSession({
      sessionId: "22222222-2222-2222-2222-222222222222",
      member: "11111111-1111-1111-1111-111111111111",
      userAgent: CHROME_MAC,
      ip: "203.0.113.9",
      db,
    });
    expect(rpc).toHaveBeenCalledWith("console_auth_start_session", {
      p_session_id: "22222222-2222-2222-2222-222222222222",
      p_member: "11111111-1111-1111-1111-111111111111",
      p_device_label: "Chrome on macOS",
      p_address_hash: "local",
    });
  });
});

describe("consoleEnvironment", () => {
  it("names the deployment, falling back to the run mode", () => {
    expect(consoleEnvironment()).toBe("test");
    // Ruling R1 (tests/unit/proxy.test.ts, tests/unit/console/keys/rp.test.ts): env()'s superRefine
    // refuses a deployed VERCEL_ENV without the shared store, so a bare VERCEL_ENV=production stub
    // fails that parse and silently falls back to defaults -- dropping VERCEL_ENV entirely and
    // leaving this assertion checking the non-production branch. The shared store must be stubbed
    // too for "production" to be the value actually under test.
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    vi.stubEnv("DATA_KEY", `${"A".repeat(43)}=`);
    resetEnvCache();
    expect(consoleEnvironment()).toBe("production");
  });
});
