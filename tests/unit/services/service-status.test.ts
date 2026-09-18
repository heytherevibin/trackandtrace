import { describe, expect, it } from "vitest";
import { parseEnv, type Env } from "@/services/env";
import { serviceStatus } from "@/services/service-status";

const FAKE_RAILKIT = "railkit_0123456789abcdef0123456789abcdef";
const SUPABASE = { NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_0123456789abcdefghij" };

function envOf(source: Record<string, string>): Env {
  const parsed = parseEnv(source);
  if (!parsed.ok) throw new Error(parsed.issues.join("; "));
  return parsed.env;
}

describe("serviceStatus", () => {
  it("is operational when checks have a source and accounts are configured", () => {
    const status = serviceStatus(envOf({ NODE_ENV: "production", PNR_SOURCE: "railkit", RAILKIT_API_KEY: FAKE_RAILKIT, ...SUPABASE }));
    expect(status).toEqual({ overall: "operational", checks: "operational", accounts: "operational" });
  });

  it("is partial when one part is unavailable", () => {
    expect(serviceStatus(envOf({ NODE_ENV: "production", ...SUPABASE }))).toEqual({ overall: "partial", checks: "unavailable", accounts: "operational" });
    expect(serviceStatus(envOf({ NODE_ENV: "development", PNR_SOURCE: "fixture" }))).toEqual({ overall: "partial", checks: "operational", accounts: "unavailable" });
  });

  it("is down when nothing is available", () => {
    expect(serviceStatus(envOf({ NODE_ENV: "production" }))).toEqual({ overall: "down", checks: "unavailable", accounts: "unavailable" });
  });
});
