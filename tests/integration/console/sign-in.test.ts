import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendSignInLink = vi.fn(() => Promise.resolve());
vi.mock("@/console/auth/sign-in-link", () => ({ sendSignInLink, confirmUrl: () => "" }));
// `after` runs its callback inline here, so a test can assert what the route scheduled.
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));

// The console's sign-in route answers the same for every address and never says whether it belongs
// to a member. The lookup, the mint and the send all run in `after()`, once the response is already
// on its way, so nothing a caller can measure -- in content or in timing -- says which address is a
// member's (spec §C, §3A).

let route: typeof import("@/app/console/api/sign-in/route");

function post(body: unknown, headers: Record<string, string | null> = {}): Request {
  const finalHeaders: Record<string, string> = {
    "content-type": "application/json",
    "sec-fetch-site": "same-origin",
    "x-forwarded-for": "198.51.100.7",
    // consoleOrigin reads this directly -- it is never inferred from the request URL -- so a test
    // that wants the route to recognise this connection as the console must set it explicitly.
    host: "admin.localhost:4210",
  };
  for (const [key, value] of Object.entries(headers)) {
    if (value === null) {
      delete finalHeaders[key];
    } else {
      finalHeaders[key] = value;
    }
  }
  return new Request("http://admin.localhost:4210/api/sign-in", {
    method: "POST",
    headers: finalHeaders,
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  sendSignInLink.mockClear();
  vi.resetModules();
  route = await import("@/app/console/api/sign-in/route");
});

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/sign-in where the console must not run", () => {
  it("answers 503 with the local-database sentence for a hosted Supabase URL and no VERCEL_ENV, never reaching the rate limiter", async () => {
    // Deliberately no matching publishable key: env() fails its own validation and falls back to
    // defaults outside production, dropping NEXT_PUBLIC_SUPABASE_URL from its parsed result. The
    // gate must still see it, since it reads supabasePublicEnv.url directly (see availability.test.ts).
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.resetModules();
    route = await import("@/app/console/api/sign-in/route");

    for (let i = 0; i < 6; i++) {
      const response = await route.POST(post({ email: "asha@example.com" }));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ code: "CONSOLE_UNAVAILABLE", message: "Point the app at a local Supabase to use the console." });
    }
    expect(sendSignInLink).not.toHaveBeenCalled();
  });
});

describe("POST /api/sign-in on the console", () => {
  it("answers the same for any valid address", async () => {
    for (const email of ["asha@example.com", "nobody@example.org"]) {
      const response = await route.POST(post({ email }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    }
  });

  it("refuses an address that isn't one, with the drawn wording", async () => {
    const response = await route.POST(post({ email: "asha@example" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_INPUT", message: "Enter an email address like name@example.com." });
    expect(sendSignInLink).not.toHaveBeenCalled();
  });

  it("refuses requests from another site, with the console's own wording", async () => {
    const response = await route.POST(post({ email: "asha@example.com" }, { "sec-fetch-site": "same-site" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "INVALID_INPUT", message: "Cross-site requests are refused." });
    expect(sendSignInLink).not.toHaveBeenCalled();
  });

  it("limits one address to 5 requests in 10 minutes", async () => {
    for (let i = 0; i < 5; i++) expect((await route.POST(post({ email: "asha@example.com" }))).status).toBe(200);
    const sixth = await route.POST(post({ email: "Asha@Example.com" }));
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toMatchObject({ code: "RATE_LIMITED", message: "Too many sign-in requests. Try again in 10 minutes." });
  });

  it("limits one connection to 20 requests in 10 minutes", async () => {
    for (let i = 0; i < 20; i++) expect((await route.POST(post({ email: `a${i}@example.com` }))).status).toBe(200);
    expect((await route.POST(post({ email: "b@example.com" }))).status).toBe(429);
  });

  describe("same-origin fallback (no Sec-Fetch-Site header)", () => {
    it("allows matching origin header", async () => {
      const response = await route.POST(
        post({ email: "fallback1@example.com" }, { "sec-fetch-site": null, origin: "http://admin.localhost:4210" })
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    });

    it("refuses mismatched origin header", async () => {
      const response = await route.POST(
        post({ email: "fallback2@example.com" }, { "sec-fetch-site": null, origin: "https://trakline.in" })
      );
      expect(response.status).toBe(403);
    });

    it("refuses null origin header", async () => {
      const response = await route.POST(
        post({ email: "fallback3@example.com" }, { "sec-fetch-site": null, origin: "null" })
      );
      expect(response.status).toBe(403);
    });

    it("refuses when both Sec-Fetch-Site and Origin are absent", async () => {
      const response = await route.POST(
        post({ email: "fallback4@example.com" }, { "sec-fetch-site": null, origin: null })
      );
      expect(response.status).toBe(403);
    });
  });

  describe("sending the link (scheduled in after(), so the answer says nothing)", () => {
    it("answers identically in content for a member and a stranger", async () => {
      const one = await route.POST(post({ email: "asha@trakline.in" }));
      const two = await route.POST(post({ email: "stranger@example.com" }));
      expect(one.status).toBe(200);
      expect(two.status).toBe(200);
      expect(await one.json()).toEqual(await two.json());
    });

    it("lower-cases the address before it reaches the lookup", async () => {
      await route.POST(post({ email: "Asha@Trakline.IN" }));
      expect(sendSignInLink).toHaveBeenCalledWith("asha@trakline.in", "http://admin.localhost:4210");
    });

    it("sends through after(), not before the answer", async () => {
      const response = await route.POST(post({ email: "asha@trakline.in" }));
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(sendSignInLink).toHaveBeenCalledOnce();
    });
  });
});
