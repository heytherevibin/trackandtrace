import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock's factory is hoisted above every import and above any ordinary top-level `const` in this
// file, so the mocks it returns must be declared with vi.hoisted -- same note as
// tests/integration/console/keys.test.ts. importOriginal keeps `tapReason` (the real zod schema the
// /options route builds its body validation from) live while replacing only the two functions that
// would otherwise reach a real database.
const { beginTap, verifyTap } = vi.hoisted(() => ({
  beginTap: vi.fn(() => Promise.resolve({ options: { challenge: "c" } })),
  verifyTap: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/console/keys/tap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/console/keys/tap")>();
  return { ...actual, beginTap, verifyTap };
});

import { POST as options } from "@/app/console/api/tap/options/route";
import { TAP_VALUE_MAX } from "@/console/keys/tap-schema";
import { consoleMessages } from "@/console/messages";
import { POST as verify } from "@/app/console/api/tap/verify/route";

function post(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", host: "admin.localhost:4210", ...headers },
  });
}

const OPTIONS_URL = "http://admin.localhost:4210/console/api/tap/options";
const VERIFY_URL = "http://admin.localhost:4210/console/api/tap/verify";
const TAP_BODY = { action: "Removed a key", target: "YubiKey 5 NFC", value: "2", reason: "Left at the old office." };

beforeEach(() => vi.clearAllMocks());

describe("POST /api/tap/options", () => {
  it("hands back the options beginTap produced", async () => {
    const response = await options(post(OPTIONS_URL, TAP_BODY));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, options: { challenge: "c" } });
  });

  it("refuses a cross-site post", async () => {
    const response = await options(post(OPTIONS_URL, TAP_BODY, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(beginTap).not.toHaveBeenCalled();
  });

  it("refuses a reason shorter than 10 characters", async () => {
    const response = await options(post(OPTIONS_URL, { ...TAP_BODY, reason: "Too short" }));
    expect(response.status).toBe(400);
    expect(beginTap).not.toHaveBeenCalled();
  });

  it("refuses a reason longer than 200 characters", async () => {
    const response = await options(post(OPTIONS_URL, { ...TAP_BODY, reason: "x".repeat(201) }));
    expect(response.status).toBe(400);
    expect(beginTap).not.toHaveBeenCalled();
  });

  // `value` carries a whole canonical filter object for the audit log's export, and this cap is
  // what decides whether that export is possible at all -- the export route's own limit is derived
  // from this one. It was 200 here against 2000 there, so a 117-character search made an export
  // impossible (branch review, Important 1).
  it("accepts a value as long as the cap every other route derives from", async () => {
    const response = await options(post(OPTIONS_URL, { ...TAP_BODY, value: "x".repeat(TAP_VALUE_MAX) }));
    expect(response.status).toBe(200);
  });

  // And when one is longer still -- which no console surface can produce, every field that feeds a
  // tap being bounded where it is typed -- what comes back is a sentence. `consoleApiMessage`
  // passes a real refusal through unchanged and ConfirmItsYou renders it, so a zod message here is
  // a developer string inside the one dialog a member is asked to trust.
  it("answers a longer one with a sentence written for a member, never with zod's", async () => {
    const response = await options(post(OPTIONS_URL, { ...TAP_BODY, value: "x".repeat(TAP_VALUE_MAX + 1) }));
    expect(response.status).toBe(400);
    const answer = (await response.json()) as { readonly message: string };
    expect(answer.message).toBe(consoleMessages.tap.tooLong);
    expect(answer.message).not.toMatch(/expected|Too big|character/i);
    expect(beginTap).not.toHaveBeenCalled();
  });
});

describe("POST /api/tap/verify", () => {
  it("answers ok on success", async () => {
    const response = await verify(post(VERIFY_URL, { response: { id: "Y3JlZA" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(verifyTap).toHaveBeenCalledOnce();
  });

  it("refuses a cross-site post", async () => {
    const response = await verify(post(VERIFY_URL, { response: { id: "Y3JlZA" } }, { "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(verifyTap).not.toHaveBeenCalled();
  });
});
