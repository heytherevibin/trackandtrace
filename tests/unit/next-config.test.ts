import { getRedirectUrl, unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import { describe, expect, it, vi } from "vitest";
import nextConfig from "../../next.config";

// trakline.in is the one address; www answers with a permanent redirect to it.

function request(url: string) {
  return unstable_getResponseFromNextConfig({ url, nextConfig });
}

describe("next.config redirects", () => {
  it("sends www.trakline.in to trakline.in with a permanent redirect, keeping the path and query", async () => {
    const response = await request("https://www.trakline.in/pnr?utm_source=sms");
    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe("https://trakline.in/pnr?utm_source=sms");
  });

  it("sends the www home page to the apex home page", async () => {
    const response = await request("https://www.trakline.in/");
    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe("https://trakline.in/");
  });

  it("keeps a sign-in link's token on the way to the apex", async () => {
    const response = await request("https://www.trakline.in/auth/callback?next=%2Faccount&token_hash=abc&type=email");
    expect(getRedirectUrl(response)).toBe("https://trakline.in/auth/callback?next=%2Faccount&token_hash=abc&type=email");
  });

  it("leaves the apex, previews and local servers alone", async () => {
    for (const url of ["https://trakline.in/pnr", "https://trakline-bdq1lxt5p-trakline.vercel.app/", "http://localhost:3000/"]) {
      expect(getRedirectUrl(await request(url))).toBeNull();
    }
  });
});

describe("the content security policy", () => {
  async function headersFor(env: Record<string, string>) {
    vi.resetModules();
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const { default: config } = await import("../../next.config");
    const response = await unstable_getResponseFromNextConfig({ url: "https://trakline.in/", nextConfig: config });
    vi.unstubAllEnvs();
    return response.headers;
  }

  it("is enforced, not only reported", async () => {
    const headers = await headersFor({ NODE_ENV: "production" });
    expect(headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(headers.get("content-security-policy-report-only")).toBeNull();
  });

  it("upgrades insecure requests outside development", async () => {
    expect((await headersFor({ NODE_ENV: "production" })).get("content-security-policy")).toContain("upgrade-insecure-requests");
    expect((await headersFor({ NODE_ENV: "development" })).get("content-security-policy")).not.toContain("upgrade-insecure-requests");
  });

  it("reports violations to Sentry from production only", async () => {
    const dsn = "https://abc@o1.ingest.de.sentry.io/2";
    const production = await headersFor({ NODE_ENV: "production", VERCEL_ENV: "production", NEXT_PUBLIC_SENTRY_DSN: dsn });
    expect(production.get("content-security-policy")).toContain("report-uri https://o1.ingest.de.sentry.io/api/2/security/?sentry_key=abc");
    const preview = await headersFor({ NODE_ENV: "production", VERCEL_ENV: "preview", NEXT_PUBLIC_SENTRY_DSN: dsn });
    expect(preview.get("content-security-policy")).not.toContain("report-uri");
    const withoutDsn = await headersFor({ NODE_ENV: "production", VERCEL_ENV: "production" });
    expect(withoutDsn.get("content-security-policy")).not.toContain("report-uri");
  });
});

describe("headers by host", () => {
  async function headersAt(url: string) {
    return (await unstable_getResponseFromNextConfig({ url, nextConfig })).headers;
  }

  it("keeps the traveller policy off the console host, whose own policy comes from the proxy", async () => {
    for (const url of ["https://admin.trakline.in/login", "http://admin.localhost:4210/login"]) {
      const headers = await headersAt(url);
      expect(headers.get("content-security-policy"), url).toBeNull();
      expect(headers.get("x-robots-tag"), url).toBe("noindex, nofollow, noarchive");
      expect(headers.get("referrer-policy"), url).toBe("no-referrer");
      expect(headers.get("cross-origin-opener-policy"), url).toBe("same-origin");
      expect(headers.get("cross-origin-resource-policy"), url).toBe("same-origin");
      expect(headers.get("permissions-policy"), url).toBe("camera=(), microphone=(), geolocation=(), publickey-credentials-get=(self), publickey-credentials-create=(self)");
      expect(headers.get("x-frame-options"), url).toBe("DENY");
      expect(headers.get("strict-transport-security"), url).toBe("max-age=63072000; includeSubDomains; preload");
      expect(headers.get("x-content-type-options"), url).toBe("nosniff");
    }
  });

  it("keeps the traveller host's headers as they were", async () => {
    const headers = await headersAt("https://trakline.in/pnr");
    expect(headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(headers.get("x-robots-tag")).toBeNull();
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=()");
    expect(headers.get("x-dns-prefetch-control")).toBe("on");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
  });
});
