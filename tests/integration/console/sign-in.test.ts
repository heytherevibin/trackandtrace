import { beforeEach, describe, expect, it, vi } from "vitest";

// The console's sign-in route answers the same for every address and never says whether it belongs to a member.
// Plan 2c adds sending, for members only, behind this same answer.

let route: typeof import("@/app/console/api/sign-in/route");

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://admin.localhost:4210/api/sign-in", {
    method: "POST",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-forwarded-for": "198.51.100.7", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  vi.resetModules();
  route = await import("@/app/console/api/sign-in/route");
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
  });

  it("refuses requests from another site", async () => {
    const response = await route.POST(post({ email: "asha@example.com" }, { "sec-fetch-site": "same-site" }));
    expect(response.status).toBe(403);
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
});
