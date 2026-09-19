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
