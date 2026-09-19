import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// The proxy is the host router. With Supabase unconfigured, the traveller branch passes requests through untouched.
vi.mock("@/services/supabase/public-env", () => ({ isSupabaseConfigured: () => false, supabasePublicEnv: { url: "", publishableKey: "" } }));

const { proxy } = await import("@/proxy");

function request(url: string): NextRequest {
  return new NextRequest(url, { headers: { host: new URL(url).host } });
}

afterEach(() => vi.unstubAllEnvs());

describe("the proxy on the console host", () => {
  it("rewrites a page into the console tree, with a nonce policy on the request and the response", async () => {
    const response = await proxy(request("http://admin.localhost:4210/login"));
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://admin.localhost:4210/console/login");
    const policy = response.headers.get("content-security-policy") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
    expect(nonce).toBeTruthy();
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
  });

  it("maps the home page onto the console's home", async () => {
    const response = await proxy(request("http://admin.localhost:4210/"));
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://admin.localhost:4210/console");
  });

  it("keeps the query string", async () => {
    const response = await proxy(request("http://admin.localhost:4210/login?step=key"));
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://admin.localhost:4210/console/login?step=key");
  });

  it("gives each request its own nonce", async () => {
    const a = (await proxy(request("http://admin.localhost:4210/login"))).headers.get("x-middleware-request-x-nonce");
    const b = (await proxy(request("http://admin.localhost:4210/login"))).headers.get("x-middleware-request-x-nonce");
    expect(a).not.toBe(b);
  });

  it("answers 404 to the internal /console addresses, so each page has one address", async () => {
    expect((await proxy(request("http://admin.localhost:4210/console/login"))).status).toBe(404);
  });

  it("closes robots and refuses the traveller service worker and manifest", async () => {
    const robots = await proxy(request("http://admin.localhost:4210/robots.txt"));
    expect(await robots.text()).toBe("User-agent: *\nDisallow: /\n");
    expect((await proxy(request("http://admin.localhost:4210/sw.js"))).status).toBe(404);
    expect((await proxy(request("http://admin.localhost:4210/manifest.webmanifest"))).status).toBe(404);
  });

  it("serves the console only on production's own console host", async () => {
    // Ruling R1: env() refuses a deployment environment without the shared store and DATA_KEY, so a bare
    // VERCEL_ENV=production stub falls back to defaults and drops VERCEL_ENV. Stub a valid production
    // environment before resetting the cache.
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "token");
    vi.stubEnv("DATA_KEY", `${"A".repeat(43)}=`);
    const { resetEnvCache } = await import("@/services/env");
    resetEnvCache();
    expect((await proxy(request("https://admin.trakline.in/login"))).headers.get("x-middleware-rewrite")).toBe("https://admin.trakline.in/console/login");
    expect((await proxy(request("http://admin.localhost:4210/login"))).headers.get("x-middleware-rewrite")).toBeNull();
    resetEnvCache();
  });
});

describe("the proxy on traveller hosts", () => {
  it("answers 404 to the console tree", async () => {
    expect((await proxy(request("https://trakline.in/console/login"))).status).toBe(404);
    expect((await proxy(request("http://localhost:4210/console"))).status).toBe(404);
  });

  it("leaves traveller pages alone, with no console policy", async () => {
    const response = await proxy(request("https://trakline.in/pnr"));
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
