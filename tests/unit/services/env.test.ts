import { afterEach, describe, expect, it, vi } from "vitest";
import { accountsConfigured, env, fixtureAllowed, googleSignInEnabled, liveRequestsPerDay, parseEnv, passkeysEnabled, resetEnvCache, sharedStoreConfig } from "@/services/env";

const dev = { NODE_ENV: "development" } as const;

/** Shaped like a RailKit key so the env schema accepts it; assembled, never written out. */
const FAKE_KEY = `railkit_${"0123456789abcdef".repeat(2)}`;

describe("parseEnv", () => {
  it("defaults PNR_SOURCE to live and rate limiting to auto", () => {
    const parsed = parseEnv(dev);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.env.PNR_SOURCE).toBe("live");
    expect(parsed.env.RATE_LIMIT_STRATEGY).toBe("auto");
    expect(parsed.env.LIVE_SOURCE_ENABLED).toBe(false);
  });

  it("accepts PNR_SOURCE=fixture in development and test", () => {
    expect(parseEnv({ ...dev, PNR_SOURCE: "fixture" }).ok).toBe(true);
    expect(parseEnv({ NODE_ENV: "test", PNR_SOURCE: "fixture" }).ok).toBe(true);
  });

  it("refuses PNR_SOURCE=fixture in production", () => {
    const parsed = parseEnv({ NODE_ENV: "production", PNR_SOURCE: "fixture" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.join(" ")).toMatch(/fixture/i);
  });

  it("rejects the upstash strategy without both credentials", () => {
    const parsed = parseEnv({ ...dev, RATE_LIMIT_STRATEGY: "upstash", UPSTASH_REDIS_REST_URL: "https://x.upstash.io" });
    expect(parsed.ok).toBe(false);
  });

  it("rejects a half-configured Supabase pair", () => {
    const parsed = parseEnv({ ...dev, NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" });
    expect(parsed.ok).toBe(false);
  });

  it("rejects an unknown PNR_SOURCE value", () => {
    expect(parseEnv({ ...dev, PNR_SOURCE: "demo" }).ok).toBe(false);
  });

  it("refuses the e2e outbox in production", () => {
    const parsed = parseEnv({ NODE_ENV: "production", E2E: "1" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues.join(" ")).toMatch(/E2E=1 is refused in production/);
  });

  it("refuses the e2e outbox on a production deployment even when NODE_ENV itself says otherwise", () => {
    const parsed = parseEnv({ NODE_ENV: "development", VERCEL_ENV: "production", E2E: "1" });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.issues.join(" ")).toMatch(/E2E=1 is refused in production/);
  });

  it("defaults the console's sender without needing a variable", () => {
    const parsed = parseEnv({});
    expect(parsed.ok && parsed.env.CONSOLE_EMAIL_FROM).toBe("Trakline Console <console@trakline.in>");
  });
});

describe("derived flags", () => {
  it("accountsConfigured needs both public Supabase vars", () => {
    const off = parseEnv(dev);
    const on = parseEnv({
      ...dev,
      NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_0123456789abcdefghij",
    });
    if (!off.ok || !on.ok) throw new Error("expected valid env");
    expect(accountsConfigured(off.env)).toBe(false);
    expect(accountsConfigured(on.env)).toBe(true);
  });

  it("reads Supabase's publishable and secret key names, not the legacy anon and service-role names", () => {
    const legacy = parseEnv({ ...dev, NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_0123456789abcdefghij" });
    expect(legacy.ok).toBe(false);
    const current = parseEnv({ ...dev, SUPABASE_SECRET_KEY: "sb_secret_0123456789abcdefghijkl" });
    if (!current.ok) throw new Error("expected valid env");
    expect(current.env.SUPABASE_SECRET_KEY).toBe("sb_secret_0123456789abcdefghijkl");
  });

  it("googleSignInEnabled needs accounts configured and AUTH_GOOGLE_ENABLED=1", () => {
    const accounts = { ...dev, NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_0123456789abcdefghij" };
    const cases = [
      [accounts, false],
      [{ ...accounts, AUTH_GOOGLE_ENABLED: "1" }, true],
      [{ ...dev, AUTH_GOOGLE_ENABLED: "1" }, false],
    ] as const;
    for (const [source, expected] of cases) {
      const parsed = parseEnv(source);
      if (!parsed.ok) throw new Error("expected valid env");
      expect(googleSignInEnabled(parsed.env)).toBe(expected);
    }
  });

  it("passkeysEnabled needs accounts configured and AUTH_PASSKEY_ENABLED=1", () => {
    const accounts = { ...dev, NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_0123456789abcdefghij" };
    const cases = [
      [accounts, false],
      [{ ...accounts, AUTH_PASSKEY_ENABLED: "1" }, true],
      [{ ...dev, AUTH_PASSKEY_ENABLED: "1" }, false],
    ] as const;
    for (const [source, expected] of cases) {
      const parsed = parseEnv(source);
      if (!parsed.ok) throw new Error("expected valid env");
      expect(passkeysEnabled(parsed.env)).toBe(expected);
    }
  });

  it("fixtureAllowed is true only for fixture outside production", () => {
    const fixture = parseEnv({ ...dev, PNR_SOURCE: "fixture" });
    const live = parseEnv(dev);
    if (!fixture.ok || !live.ok) throw new Error("expected valid env");
    expect(fixtureAllowed(fixture.env)).toBe(true);
    expect(fixtureAllowed(live.env)).toBe(false);
  });
});

describe("the active source", () => {
  const of = (source: Record<string, string>) => {
    const parsed = parseEnv(source);
    if (!parsed.ok) throw new Error(parsed.issues.join("; "));
    return parsed.env;
  };

  it("names the active source for provenance: fixture, a third party, or live", async () => {
    const { activePnrSource } = await import("@/services/env");
    expect(activePnrSource(of({ NODE_ENV: "development", PNR_SOURCE: "fixture" }))).toBe("fixture");
    expect(activePnrSource(of({ NODE_ENV: "production", PNR_SOURCE: "railkit", RAILKIT_API_KEY: FAKE_KEY }))).toBe("railkit");
    expect(activePnrSource(of({ NODE_ENV: "production" }))).toBe("live");
  });

  it("falls back to live when a third-party source is named without its key", async () => {
    const { activePnrSource, isThirdPartySource } = await import("@/services/env");
    const current = { ...of({ NODE_ENV: "production", PNR_SOURCE: "railkit", RAILKIT_API_KEY: FAKE_KEY }), RAILKIT_API_KEY: undefined };
    expect(activePnrSource(current)).toBe("live");
    expect(isThirdPartySource("live")).toBe(false);
    expect(isThirdPartySource("fixture")).toBe(false);
    expect(isThirdPartySource("railkit")).toBe(true);
  });
});

describe("RailKit source configuration", () => {
  const KEY = FAKE_KEY;
  const of = (source: Record<string, string>) => {
    const parsed = parseEnv(source);
    if (!parsed.ok) throw new Error(parsed.issues.join("; "));
    return parsed.env;
  };

  it("requires a key when PNR_SOURCE=railkit", () => {
    const parsed = parseEnv({ NODE_ENV: "production", PNR_SOURCE: "railkit" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.join(" ")).toMatch(/RAILKIT_API_KEY/);
  });

  it("defaults the base URL and timeout, and names railkit as the active source", async () => {
    const { activePnrSource } = await import("@/services/env");
    const current = of({ NODE_ENV: "production", PNR_SOURCE: "railkit", RAILKIT_API_KEY: KEY });
    expect(current.RAILKIT_BASE_URL).toBe("https://api.railkit.in");
    expect(current.RAILKIT_TIMEOUT_MS).toBe(8000);
    expect(current.PNR_FALLBACK).toBe("none");
    expect(activePnrSource(current)).toBe("railkit");
  });

  it.each([
    ["a key from another service", "sk_live_0123456789abcdef0123"],
    ["a key with a stray space", `${KEY} `],
    ["a key cut short", "railkit_0123"],
  ])("refuses %s, so a bad paste fails loudly at boot", (_label, key) => {
    const parsed = parseEnv({ NODE_ENV: "production", PNR_SOURCE: "railkit", RAILKIT_API_KEY: key });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.join(" ")).toMatch(/RAILKIT_API_KEY/);
  });

  it.each(["http://api.railkit.in", "https://api.railkit.in/", "https://api.railkit.in/api/v1", "ftp://api.railkit.in"])(
    "refuses the base URL %s",
    (url) => {
      const parsed = parseEnv({ NODE_ENV: "production", PNR_SOURCE: "railkit", RAILKIT_API_KEY: KEY, RAILKIT_BASE_URL: url });
      expect(parsed.ok).toBe(false);
    },
  );

  it("never lets a source be its own fallback", () => {
    const self = parseEnv({ NODE_ENV: "production", PNR_SOURCE: "railkit", RAILKIT_API_KEY: KEY, PNR_FALLBACK: "railkit" });
    expect(self.ok).toBe(false);
    if (self.ok) return;
    expect(self.issues.join(" ")).toMatch(/PNR_FALLBACK/);
  });

  it.each([["live"], ["fixture"]])("refuses a fallback behind PNR_SOURCE=%s, which would never ask it", (source) => {
    const parsed = parseEnv({ NODE_ENV: "development", PNR_SOURCE: source, PNR_FALLBACK: "railkit", RAILKIT_API_KEY: KEY });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.join(" ")).toMatch(/PNR_FALLBACK/);
  });

  // The fallback seam is kept for a second provider and there is not one yet, so those two rules
  // leave `none` as the only setting that parses. Pinned so the day it stops being true is a day
  // somebody chose, not a day somebody discovered. See PNR_FALLBACK in src/services/env.ts.
  it("leaves `none` as the only fallback that parses while one provider is configured", () => {
    const settings = ["none", "railkit", "live", "fixture", "nonsense"];
    const accepted = settings.filter((fallback) => parseEnv({ NODE_ENV: "production", PNR_SOURCE: "railkit", RAILKIT_API_KEY: KEY, PNR_FALLBACK: fallback }).ok);
    expect(accepted).toEqual(["none"]);
  });

  // The one exception, and the reason it exists: `env()` THROWS in production, `railkit` + `rapidapi`
  // was a perfectly valid pair for the six days between one provider replacing the other and the
  // other being deleted, and nothing made anyone change it. Without this the deploy that removed the
  // source would have taken every traveller PNR check down over a setting whose only correct reading
  // is `none`.
  it("reads the retired fallback as `none` rather than refusing to boot over it", () => {
    const parsed = parseEnv({ NODE_ENV: "production", PNR_SOURCE: "railkit", RAILKIT_API_KEY: KEY, PNR_FALLBACK: "rapidapi" });

    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.env.PNR_FALLBACK).toBe("none");
  });

  // Found by a failing preview deploy, not by reading: Preview held its OWN `PNR_SOURCE=rapidapi`
  // and no RailKit key at all, so it had been running on the removed provider the whole time. The
  // refusal is right -- it throws at build time, so nothing ships -- but `expected one of
  // live|fixture|railkit` does not tell an operator that a provider was removed or what to do.
  it("says what to do when a deployment still names the retired provider", () => {
    const parsed = parseEnv({ NODE_ENV: "production", PNR_SOURCE: "rapidapi" });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    const said = parsed.issues.join(" ");
    expect(said).toMatch(/was removed/);
    expect(said).toMatch(/PNR_SOURCE=railkit/);
    expect(said).toMatch(/PNR_SOURCE=live/);
    // The part that would have saved a deploy: each Vercel environment holds its own value.
    expect(said).toMatch(/EVERY Vercel environment/);
  });

  it("no longer knows the retired third-party source, by either of its names", () => {
    expect(parseEnv({ NODE_ENV: "production", PNR_SOURCE: "rapidapi" }).ok).toBe(false);
    // Its leftover variables are unknown keys, not errors: a deployment still carrying them boots.
    const current = of({ NODE_ENV: "production", PNR_SOURCE: "railkit", RAILKIT_API_KEY: KEY, RAPIDAPI_KEY: "unused", RAPIDAPI_HOST: "irctc1.p.rapidapi.com" });
    expect(current.PNR_SOURCE).toBe("railkit");
    expect(Object.keys(current).filter((name) => name.startsWith("RAPIDAPI"))).toEqual([]);
  });
});

const DATA_KEY = Buffer.alloc(32, 7).toString("base64");
const KV = { KV_REST_API_URL: "https://fake.upstash.io", KV_REST_API_TOKEN: "fake-token" } as const;

describe("the shared store", () => {
  it("is required on a production deployment", () => {
    const parsed = parseEnv({ NODE_ENV: "production", VERCEL_ENV: "production" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.join(" ")).toMatch(/DATA_KEY/);
  });

  it("is required on a preview too", () => {
    expect(parseEnv({ NODE_ENV: "production", VERCEL_ENV: "preview", ...KV }).ok).toBe(false);
  });

  it("accepts the names Vercel's Upstash integration injects, and prefixes keys with the deployment", () => {
    const parsed = parseEnv({ NODE_ENV: "production", VERCEL_ENV: "production", ...KV, DATA_KEY });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(sharedStoreConfig(parsed.env)).toEqual({
      credentials: { url: "https://fake.upstash.io", token: "fake-token" },
      dataKey: DATA_KEY,
      prefix: "tt:production",
    });
  });

  it("prefers the UPSTASH_ names when both pairs are present", () => {
    const parsed = parseEnv({ ...dev, ...KV, UPSTASH_REDIS_REST_URL: "https://direct.upstash.io", UPSTASH_REDIS_REST_TOKEN: "direct", DATA_KEY });
    if (!parsed.ok) throw new Error(parsed.issues.join());
    expect(sharedStoreConfig(parsed.env)?.credentials.url).toBe("https://direct.upstash.io");
  });

  it("refuses the memory strategy on a deployment", () => {
    expect(parseEnv({ NODE_ENV: "production", VERCEL_ENV: "production", ...KV, DATA_KEY, RATE_LIMIT_STRATEGY: "memory" }).ok).toBe(false);
  });

  it("names exactly what a deployment is missing", () => {
    const issues = (source: Record<string, string>) => {
      const parsed = parseEnv({ NODE_ENV: "production", VERCEL_ENV: "preview", ...source });
      return parsed.ok ? "" : parsed.issues.join(" ");
    };
    expect(issues({ ...KV })).toMatch(/missing DATA_KEY/);
    expect(issues({ ...KV })).not.toMatch(/URL and token/);
    expect(issues({ DATA_KEY })).toMatch(/missing the Upstash URL and token/);
    expect(issues({ ...KV, DATA_KEY, RATE_LIMIT_STRATEGY: "memory" })).toMatch(/RATE_LIMIT_STRATEGY=memory/);
  });

  it("stays off, and optional, for a CI or local build", () => {
    const parsed = parseEnv({ NODE_ENV: "production" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(sharedStoreConfig(parsed.env)).toBeNull();
  });

  it("stays off without DATA_KEY, even with credentials", () => {
    const parsed = parseEnv({ ...dev, ...KV });
    if (!parsed.ok) throw new Error(parsed.issues.join());
    expect(sharedStoreConfig(parsed.env)).toBeNull();
  });

  it("insists on 32 bytes of base64 for DATA_KEY", () => {
    expect(parseEnv({ ...dev, DATA_KEY: "too-short" }).ok).toBe(false);
    expect(parseEnv({ ...dev, DATA_KEY: Buffer.alloc(16).toString("base64") }).ok).toBe(false);
  });

  it("makes the explicit upstash strategy demand DATA_KEY", () => {
    expect(parseEnv({ ...dev, ...KV, RATE_LIMIT_STRATEGY: "upstash" }).ok).toBe(false);
    expect(parseEnv({ ...dev, ...KV, RATE_LIMIT_STRATEGY: "upstash", DATA_KEY }).ok).toBe(true);
  });
});

describe("the daily live-request budget", () => {
  it("allows 300 live requests a day unless LIVE_REQUESTS_PER_DAY says otherwise", () => {
    const standard = parseEnv(dev);
    const raised = parseEnv({ ...dev, LIVE_REQUESTS_PER_DAY: "1200" });
    if (!standard.ok || !raised.ok) throw new Error("expected valid env");
    expect(liveRequestsPerDay(standard.env)).toBe(300);
    expect(liveRequestsPerDay(raised.env)).toBe(1200);
  });

  it("refuses a budget that isn't a whole number of at least 1", () => {
    for (const value of ["0", "-5", "12.5", "lots"]) {
      expect(parseEnv({ ...dev, LIVE_REQUESTS_PER_DAY: value }).ok, value).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// The retired fallback's one-time notice
// ---------------------------------------------------------------------------
// The coercion keeps a stale `PNR_FALLBACK=rapidapi` from throwing at boot. The notice is what keeps
// it from being coerced silently for ever — an accommodation nobody is told about is how the line it
// lives on outlives the variable it was written for.

describe("the retired fallback's boot notice", () => {
  const before = { ...process.env };

  afterEach(() => {
    process.env = { ...before };
    resetEnvCache();
    vi.restoreAllMocks();
  });

  it("says so once, and says which variable to delete", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env = { ...before, NODE_ENV: "development", PNR_SOURCE: "railkit", RAILKIT_API_KEY: FAKE_KEY, PNR_FALLBACK: "rapidapi" };
    resetEnvCache();

    expect(env().PNR_FALLBACK).toBe("none");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/PNR_FALLBACK[\s\S]*removed[\s\S]*Delete the variable/);

    // Cached after the first read, so a busy process is not told on every call.
    env();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when the variable is absent, which is the state this is steering towards", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env = { ...before, NODE_ENV: "development", PNR_SOURCE: "railkit", RAILKIT_API_KEY: FAKE_KEY };
    delete process.env.PNR_FALLBACK;
    resetEnvCache();

    expect(env().PNR_FALLBACK).toBe("none");
    expect(warn).not.toHaveBeenCalled();
  });
});
