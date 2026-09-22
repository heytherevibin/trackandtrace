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
    const response = await options(post(OPTIONS_URL, { intent: "add_key", kind: "securityKey" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, step: "register", options: { challenge: "c" } });
  });

  it("refuses a cross-site post", async () => {
    const response = await options(post(OPTIONS_URL, { intent: "add_key", kind: "securityKey" }, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(beginCeremony).not.toHaveBeenCalled();
  });

  it("refuses an intent it does not know", async () => {
    const response = await options(post(OPTIONS_URL, { intent: "action" }));
    expect(response.status).toBe(400);
    expect(beginCeremony).not.toHaveBeenCalled();
  });

  it("carries the kind the member chose through to the ceremony", async () => {
    await options(post(OPTIONS_URL, { intent: "add_key", kind: "thisDevice" }));
    expect(beginCeremony).toHaveBeenCalledWith(expect.objectContaining({ intent: "add_key", kind: "thisDevice" }));
  });

  // The kind is a hint the client sends about which browser sheet to open, so it is untrusted like
  // any other field on the wire: parsed against the console's own two values, never taken as given.
  it("refuses a kind outside the two the console offers", async () => {
    for (const kind of ["localDevice", "remoteDevice", "platform", "", 1, null]) {
      const response = await options(post(OPTIONS_URL, { intent: "add_key", kind }));
      expect(response.status, `kind: ${JSON.stringify(kind)}`).toBe(400);
    }
    expect(beginCeremony).not.toHaveBeenCalled();
  });

  it("refuses an add_key with no kind at all, rather than guessing one", async () => {
    const response = await options(post(OPTIONS_URL, { intent: "add_key" }));
    expect(response.status).toBe(400);
    expect(beginCeremony).not.toHaveBeenCalled();
  });

  // Signing in picks among keys the member already holds; there is nothing to prefer, and a kind
  // on this intent would be a field nothing reads.
  it("refuses a kind on a sign-in, which registers nothing", async () => {
    const response = await options(post(OPTIONS_URL, { intent: "sign_in", kind: "securityKey" }));
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
    const response = await verify(post(VERIFY_URL, { intent: "add_key", step: "tap", kind: "securityKey", response: { id: "Y3JlZA" } }));
    expect(await response.json()).toEqual({ ok: true, step: "register", options: { challenge: "r" } });
  });

  // The tap route mints the registration options for every key after the first, so this is the
  // path the owner in the defect report was actually on: the options route only ever sees the
  // first key's.
  it("carries the kind through the tap that unlocks a second key", async () => {
    await verify(post(VERIFY_URL, { intent: "add_key", step: "tap", kind: "thisDevice", response: { id: "Y3JlZA" } }));
    expect(completeTap).toHaveBeenCalledWith(expect.objectContaining({ kind: "thisDevice" }));
  });

  it("refuses a tap with no kind, or a kind outside the two the console offers", async () => {
    const noKind = await verify(post(VERIFY_URL, { intent: "add_key", step: "tap", response: { id: "Y3JlZA" } }));
    expect(noKind.status).toBe(400);
    const badKind = await verify(post(VERIFY_URL, { intent: "add_key", step: "tap", kind: "localDevice", response: { id: "Y3JlZA" } }));
    expect(badKind.status).toBe(400);
    expect(completeTap).not.toHaveBeenCalled();
  });

  it("records a key and reports what changed", async () => {
    const response = await verify(post(VERIFY_URL, { intent: "add_key", step: "register", name: "iPhone", response: { id: "bmV3" } }));
    expect(await response.json()).toEqual({ ok: true, keyCount: 2, activated: true, next: "/" });
  });

  // The stored type is read off the credential that actually answered (verifyRegistration's own
  // credentialDeviceType/credentialBackedUp), never off what the member said they were about to
  // present. A kind on the register step would be the client naming the row's own type, so the
  // step that writes the row refuses to hear one at all.
  it("refuses a kind on the register step: the stored type is never the client's to name", async () => {
    const response = await verify(post(VERIFY_URL, { intent: "add_key", step: "register", name: "iPhone", kind: "securityKey", response: { id: "bmV3" } }));
    expect(response.status).toBe(400);
    expect(completeRegistration).not.toHaveBeenCalled();
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

  it("refuses a cross-site post", async () => {
    const response = await verify(post(VERIFY_URL, { intent: "sign_in", response: { id: "Y3JlZA" } }, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(completeSignIn).not.toHaveBeenCalled();
  });

  it("refuses an add_key body with no step, or a step it does not know", async () => {
    const noStep = await verify(post(VERIFY_URL, { intent: "add_key", response: { id: "Y3JlZA" } }));
    expect(noStep.status).toBe(400);
    const badStep = await verify(post(VERIFY_URL, { intent: "add_key", step: "finish", response: { id: "Y3JlZA" } }));
    expect(badStep.status).toBe(400);
    expect(completeTap).not.toHaveBeenCalled();
    expect(completeRegistration).not.toHaveBeenCalled();
  });
});
