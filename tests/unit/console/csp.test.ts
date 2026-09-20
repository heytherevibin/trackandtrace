import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { THEME_BOOT_SCRIPT } from "@/components/theme/theme-boot";
import { THEME_BOOT_HASH, consoleCsp, newNonce, sentryReportUri } from "@/console/csp";

const directive = (policy: string, name: string) => policy.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("the console CSP", () => {
  const policy = consoleCsp({ nonce: "abc123", dev: false, supabaseOrigin: "https://x.supabase.co", reportUri: null });

  it("runs only scripts carrying this request's nonce, and what they load", () => {
    const scripts = directive(policy, "script-src");
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("allows the one inline boot script by its hash", () => {
    const expected = `'sha256-${createHash("sha256").update(THEME_BOOT_SCRIPT).digest("base64")}'`;
    expect(THEME_BOOT_HASH).toBe(expected);
    expect(directive(policy, "script-src")).toContain(expected);
  });

  it("frames nothing, loads no plugins and pins the base", () => {
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("talks only to itself and Supabase", () => {
    expect(directive(policy, "connect-src")).toBe("connect-src 'self' https://x.supabase.co wss://x.supabase.co");
  });

  it("allows eval and the dev socket in development only", () => {
    const dev = consoleCsp({ nonce: "n", dev: true, supabaseOrigin: null, reportUri: null });
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toBe("connect-src 'self' ws:");
    expect(dev).not.toContain("upgrade-insecure-requests");
  });

  it("reports to Sentry from production only", () => {
    const dsn = "https://abc@o1.ingest.de.sentry.io/2";
    expect(sentryReportUri(dsn, "production")).toBe("https://o1.ingest.de.sentry.io/api/2/security/?sentry_key=abc");
    expect(sentryReportUri(dsn, "preview")).toBeNull();
    expect(sentryReportUri(undefined, "production")).toBeNull();
    expect(consoleCsp({ nonce: "n", dev: false, supabaseOrigin: null, reportUri: "https://r" })).toContain("report-uri https://r");
  });

  it("makes a fresh nonce each time", () => {
    const a = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(newNonce()).not.toBe(a);
  });
});
