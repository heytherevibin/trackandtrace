import { describe, expect, it } from "vitest";
import { accountsConfigured, fixtureAllowed, googleSignInEnabled, parseEnv, passkeysEnabled } from "@/services/env";

const dev = { NODE_ENV: "development" } as const;

describe("parseEnv", () => {
  it("defaults PNR_SOURCE to live and rate limiting to memory", () => {
    const parsed = parseEnv(dev);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.env.PNR_SOURCE).toBe("live");
    expect(parsed.env.RATE_LIMIT_STRATEGY).toBe("memory");
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
