import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock's factory is hoisted above every import and above any ordinary top-level `const` in this
// file, so the mocks it returns must be declared with vi.hoisted -- otherwise the factory runs
// before these consts are initialized. Same note in tests/unit/console/keys/webauthn.test.ts and
// tests/unit/console/auth/sign-in-link.test.ts.
const { beginCeremony, completeSignIn, completeTap, completeRegistration } = vi.hoisted(() => ({
  beginCeremony: vi.fn(() => Promise.resolve({ step: "register", options: { challenge: "c" } })),
  completeSignIn: vi.fn(() => Promise.resolve()),
  completeTap: vi.fn(() => Promise.resolve({ options: { challenge: "r" } })),
  completeRegistration: vi.fn(() => Promise.resolve({ keyCount: 2, activated: true })),
}));

vi.mock("@/console/keys/ceremony", () => ({ beginCeremony, completeSignIn, completeTap, completeRegistration, requireLinkSession: vi.fn() }));

import { POST as options } from "@/app/console/api/keys/options/route";
import { POST as verify } from "@/app/console/api/keys/verify/route";

function post(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", host: "admin.localhost:4210", ...headers },
  });
}

const OPTIONS_URL = "http://admin.localhost:4210/console/api/keys/options";
const VERIFY_URL = "http://admin.localhost:4210/console/api/keys/verify";

beforeEach(() => vi.clearAllMocks());

describe("POST /api/keys/options", () => {
  it("hands back the step and the options", async () => {
    const response = await options(post(OPTIONS_URL, { intent: "add_key" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, step: "register", options: { challenge: "c" } });
  });

  it("refuses a cross-site post", async () => {
    const response = await options(post(OPTIONS_URL, { intent: "add_key" }, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(beginCeremony).not.toHaveBeenCalled();
  });

  it("refuses an intent it does not know", async () => {
    const response = await options(post(OPTIONS_URL, { intent: "action" }));
    expect(response.status).toBe(400);
    expect(beginCeremony).not.toHaveBeenCalled();
  });
});

describe("POST /api/keys/verify", () => {
  it("finishes a sign-in and says where to go", async () => {
    const response = await verify(post(VERIFY_URL, { intent: "sign_in", response: { id: "Y3JlZA" } }));
    expect(await response.json()).toEqual({ ok: true, next: "/" });
    expect(completeSignIn).toHaveBeenCalledOnce();
  });

  it("answers a tap with the registration options it unlocked", async () => {
    const response = await verify(post(VERIFY_URL, { intent: "add_key", step: "tap", response: { id: "Y3JlZA" } }));
    expect(await response.json()).toEqual({ ok: true, step: "register", options: { challenge: "r" } });
  });

  it("records a key and reports what changed", async () => {
    const response = await verify(post(VERIFY_URL, { intent: "add_key", step: "register", name: "iPhone", response: { id: "bmV3" } }));
    expect(await response.json()).toEqual({ ok: true, keyCount: 2, activated: true, next: "/" });
  });

  it("refuses a registration with no name for the key", async () => {
    const response = await verify(post(VERIFY_URL, { intent: "add_key", step: "register", response: { id: "bmV3" } }));
    expect(response.status).toBe(400);
    expect(completeRegistration).not.toHaveBeenCalled();
  });

  it("refuses a key name longer than the column takes", async () => {
    const response = await verify(post(VERIFY_URL, { intent: "add_key", step: "register", name: "x".repeat(61), response: { id: "bmV3" } }));
    expect(response.status).toBe(400);
  });
});
