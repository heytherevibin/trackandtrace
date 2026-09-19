import { afterEach, describe, expect, it, vi } from "vitest";
import { consoleAvailability } from "@/console/availability";

afterEach(() => vi.unstubAllEnvs());

/** A fresh module graph, so a stubbed env var and the assertion see the same AppError class. */
async function freshAssertConsoleAvailable() {
  vi.resetModules();
  const [{ assertConsoleAvailable }, { AppError }] = await Promise.all([import("@/console/availability"), import("@/services/errors")]);
  return { assertConsoleAvailable, AppError };
}

// Previews and localhost share the production Supabase project, so the console must refuse to act on it there.
describe("consoleAvailability", () => {
  it("runs in production", () => {
    expect(consoleAvailability({ VERCEL_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBe("available");
  });

  it("refuses previews", () => {
    expect(consoleAvailability({ VERCEL_ENV: "preview", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBe("production-only");
  });

  it("runs locally against a local database, or none", () => {
    expect(consoleAvailability({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" })).toBe("available");
    expect(consoleAvailability({ NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321" })).toBe("available");
    expect(consoleAvailability({})).toBe("available");
  });

  it("refuses a local server pointed at a hosted project", () => {
    expect(consoleAvailability({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBe("local-database-needed");
    expect(consoleAvailability({ VERCEL_ENV: "development", NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" })).toBe("local-database-needed");
    expect(consoleAvailability({ NEXT_PUBLIC_SUPABASE_URL: "not a url" })).toBe("local-database-needed");
  });
});

// The gate route handlers and the layout must both call: it reads the same Supabase URL the
// clients read (supabasePublicEnv.url), not env()'s own possibly-defaulted-away copy of it.
describe("assertConsoleAvailable", () => {
  it("does not throw where the console is available", async () => {
    const { assertConsoleAvailable } = await freshAssertConsoleAvailable();
    expect(() => assertConsoleAvailable()).not.toThrow();
  });

  it("throws a 503 with the production-only sentence on a preview deployment", async () => {
    // A deployed VERCEL_ENV needs the shared store to parse at all (env.test.ts covers that rule);
    // without it env() falls back to defaults and silently drops VERCEL_ENV, so it must be stubbed too.
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    vi.stubEnv("DATA_KEY", `${"A".repeat(43)}=`);
    const { assertConsoleAvailable, AppError } = await freshAssertConsoleAvailable();
    let caught: unknown;
    try {
      assertConsoleAvailable();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as InstanceType<typeof AppError>).status).toBe(503);
    expect((caught as InstanceType<typeof AppError>).message).toBe("The console runs only in production.");
  });

  it("throws a 503 with the local-database sentence for a hosted Supabase URL and no VERCEL_ENV", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    const { assertConsoleAvailable, AppError } = await freshAssertConsoleAvailable();
    let caught: unknown;
    try {
      assertConsoleAvailable();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as InstanceType<typeof AppError>).status).toBe(503);
    expect((caught as InstanceType<typeof AppError>).message).toBe("Point the app at a local Supabase to use the console.");
  });
});
