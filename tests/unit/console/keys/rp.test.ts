import { afterEach, describe, expect, it, vi } from "vitest";
import { relyingParty } from "@/console/keys/rp";
import { resetEnvCache } from "@/services/env";

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("relyingParty", () => {
  it("scopes a key to the console host, over https, in production", () => {
    // A deployed VERCEL_ENV needs the shared store to parse at all (env.test.ts covers that rule);
    // without it env() falls back to defaults and silently drops VERCEL_ENV, so it must be stubbed too.
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    vi.stubEnv("DATA_KEY", `${"A".repeat(43)}=`);
    resetEnvCache();
    expect(relyingParty("admin.trakline.in")).toMatchObject({ id: "admin.trakline.in", origin: "https://admin.trakline.in" });
  });

  it("scopes it to admin.localhost, over http and with the port, locally", () => {
    expect(relyingParty("admin.localhost:4210")).toMatchObject({ id: "admin.localhost", origin: "http://admin.localhost:4210" });
  });

  it("refuses the traveller host, so a trakline.in page can never ask for a console key", () => {
    expect(() => relyingParty("trakline.in")).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
    expect(() => relyingParty(null)).toThrow(expect.objectContaining({ code: "INVALID_INPUT" }));
  });

  it("refuses the production host outside production, and the local host inside it", () => {
    expect(() => relyingParty("admin.trakline.in")).toThrow();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    vi.stubEnv("DATA_KEY", `${"A".repeat(43)}=`);
    resetEnvCache();
    expect(() => relyingParty("admin.localhost:4210")).toThrow();
  });
});
