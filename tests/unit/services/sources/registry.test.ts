import { describe, expect, it, vi } from "vitest";
import { parseEnv, type Env } from "@/services/env";
import { resolvePnrSource } from "@/services/sources";

function envOf(source: Record<string, string>): Env {
  const parsed = parseEnv(source);
  if (!parsed.ok) throw new Error(parsed.issues.join("; "));
  return parsed.env;
}

describe("resolvePnrSource", () => {
  it("serves the labelled fixture when PNR_SOURCE=fixture outside production", async () => {
    const out = await resolvePnrSource(envOf({ NODE_ENV: "development", PNR_SOURCE: "fixture" })).check("2345678901");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.snapshot.source).toBe("fixture");
  });

  it("refuses the fixture in production even when the env guard is bypassed", async () => {
    const forced: Env = { ...envOf({ NODE_ENV: "development", PNR_SOURCE: "fixture" }), NODE_ENV: "production" };
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const out = await resolvePnrSource(forced).check("2345678901");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("SOURCE_UNAVAILABLE");
    expect(out.message).toMatch(/production/i);
    error.mockRestore();
  });

  it("answers not configured when the live flag is off", async () => {
    const out = await resolvePnrSource(envOf({ NODE_ENV: "development" })).check("2345678901");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.code).toBe("SOURCE_UNAVAILABLE");
    expect(out.message).toMatch(/not configured/i);
  });

  it("answers not connected, without throwing, when the live flag is on but no adapter exists", async () => {
    const out = await resolvePnrSource(envOf({ NODE_ENV: "development", LIVE_SOURCE_ENABLED: "1" })).check("2345678901");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toMatch(/not connected/i);
  });
});
