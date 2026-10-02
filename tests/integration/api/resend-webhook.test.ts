import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/webhooks/resend, end to end with the database replaced. Public and unauthenticated:
// the signature is the only thing that makes a request ours, so what is asserted here is ORDER
// (nothing is recorded before the signature verifies) and BYTES (the signature covers the exact text
// Resend sent, not whatever a parse and a re-serialise would make of it).

const { recordWebhook } = vi.hoisted(() => ({
  recordWebhook: vi.fn<(id: string, kind: string, email: string, at: string) => Promise<"recorded" | "duplicate">>(async () => "recorded"),
}));
vi.mock("@/services/announcements/store", () => ({ recordWebhook }));

import { POST } from "@/app/api/webhooks/resend/route";
import { resetEnvCache } from "@/services/env";
import { AppError } from "@/services/errors";

const SECRET = `whsec_${Buffer.alloc(32, 5).toString("base64")}`;
const ID = "msg_2abc";
const EMAIL = "a@example.in";

// Computed here, with this file's own createHmac, so a test cannot agree with the implementation
// by sharing its helper while both are wrong.
function signed(body: string, opts: { id?: string; at?: Date; secret?: string } = {}) {
  const id = opts.id ?? ID;
  const timestamp = String(Math.floor((opts.at ?? new Date()).getTime() / 1000));
  const key = Buffer.from((opts.secret ?? SECRET).slice("whsec_".length), "base64");
  const signature = `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
  return { id, timestamp, signature };
}

type Head = { id?: string; timestamp?: string; signature?: string };

function req(body: string, head: Head): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (head.id !== undefined) headers.set("svix-id", head.id);
  if (head.timestamp !== undefined) headers.set("svix-timestamp", head.timestamp);
  if (head.signature !== undefined) headers.set("svix-signature", head.signature);
  return new Request("https://trakline.in/api/webhooks/resend", { method: "POST", headers, body });
}

const event = (type: string, to: readonly string[] = [EMAIL]) => JSON.stringify({ type, data: { to } });

beforeEach(() => {
  vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);
  resetEnvCache();
  recordWebhook.mockReset();
  recordWebhook.mockResolvedValue("recorded");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetEnvCache();
});

describe("POST /api/webhooks/resend", () => {
  it("records a bounce once and answers 200 to the replay without acting twice", async () => {
    recordWebhook.mockResolvedValueOnce("recorded").mockResolvedValueOnce("duplicate");
    const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@example.in"] } });
    const head = signed(body);
    expect((await POST(req(body, head))).status).toBe(200);
    expect((await POST(req(body, head))).status).toBe(200);
    expect(recordWebhook).toHaveBeenCalledTimes(2);
  });

  it("answers 400 and records nothing when the signature does not verify", async () => {
    recordWebhook.mockClear();
    const body = JSON.stringify({ type: "email.bounced", data: { to: ["a@example.in"] } });
    expect((await POST(req(body, { ...signed(body), signature: "v1,zzz" }))).status).toBe(400);
    expect(recordWebhook).not.toHaveBeenCalled();
  });

  it("verifies against the exact bytes Resend sent, not a parse and re-serialise of them", async () => {
    // Key order, whitespace and a \u escape: JSON.stringify(JSON.parse(raw)) is a DIFFERENT string,
    // so a handler that re-serialises before verifying fails every real webhook. A body that is
    // already canonical (as JSON.stringify makes in the tests above) cannot tell the two apart.
    const raw = '{ "data" : { "to" : [ "a\\u0040example.in" ] },\n  "type" : "email.bounced" }';
    expect(JSON.stringify(JSON.parse(raw))).not.toBe(raw);
    const res = await POST(req(raw, signed(raw)));
    expect(res.status).toBe(200);
    expect(recordWebhook).toHaveBeenCalledWith(ID, "email.bounced", EMAIL, expect.any(String));
  });

  it("answers 400 and records nothing for a body that was changed after it was signed", async () => {
    const head = signed(event("email.delivered"));
    expect((await POST(req(event("email.bounced"), head))).status).toBe(400);
    expect(recordWebhook).not.toHaveBeenCalled();
  });

  it("answers 400 and records nothing for a signature made with another secret", async () => {
    const body = event("email.bounced");
    const other = `whsec_${Buffer.alloc(32, 6).toString("base64")}`;
    expect((await POST(req(body, signed(body, { secret: other })))).status).toBe(400);
    expect(recordWebhook).not.toHaveBeenCalled();
  });

  it("answers 400 and records nothing for a timestamp outside the tolerance, which is what a replay looks like", async () => {
    const body = event("email.bounced");
    const head = signed(body, { at: new Date(Date.now() - 10 * 60_000) });
    expect((await POST(req(body, head))).status).toBe(400);
    expect(recordWebhook).not.toHaveBeenCalled();
  });

  it.each(["id", "timestamp", "signature"] as const)("answers 400 and records nothing when the svix %s header is missing", async (missing) => {
    const body = event("email.bounced");
    const head: Head = { ...signed(body) };
    delete head[missing];
    expect((await POST(req(body, head))).status).toBe(400);
    expect(recordWebhook).not.toHaveBeenCalled();
  });

  it("accepts a rotation, where any one of several signatures matches", async () => {
    const body = event("email.bounced");
    const good = signed(body);
    const head = { ...good, signature: `v1,AAAA ${good.signature}` };
    expect((await POST(req(body, head))).status).toBe(200);
    expect(recordWebhook).toHaveBeenCalledTimes(1);
  });

  it("fails closed, answering 500 and recording nothing, when the signing secret is not configured", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    resetEnvCache();
    const body = event("email.bounced");
    const res = await POST(req(body, signed(body)));
    expect(res.status).toBe(500);
    expect(recordWebhook).not.toHaveBeenCalled();
    // The likeliest failure on a first production run, so it must not read like a database outage.
    expect(await res.text()).toContain("The webhook is not configured.");
  });

  it.each([
    "email.bounced",
    "email.complained",
    "email.delivery_delayed",
    "email.delivered",
    "suppression.added",
    "suppression.removed",
    "email.something_new",
  ])("hands %s to the store verbatim, because the function decides what an event means", async (type) => {
    const body = event(type);
    const head = signed(body);
    expect((await POST(req(body, head))).status).toBe(200);
    expect(recordWebhook).toHaveBeenCalledWith(ID, type, EMAIL, new Date(Number(head.timestamp) * 1000).toISOString());
  });

  it("dates the event from the verified svix timestamp, not from anything in the body", async () => {
    const body = JSON.stringify({ type: "email.bounced", created_at: "1999-01-01T00:00:00Z", data: { to: [EMAIL] } });
    const head = signed(body);
    await POST(req(body, head));
    expect(recordWebhook.mock.calls[0]?.[3]).toBe(new Date(Number(head.timestamp) * 1000).toISOString());
  });

  it("records every recipient, each under its own id so the replay of one cannot swallow another", async () => {
    const body = event("email.bounced", ["a@example.in", "b@example.in"]);
    expect((await POST(req(body, signed(body)))).status).toBe(200);
    expect(recordWebhook).toHaveBeenCalledTimes(2);
    const [first, second] = recordWebhook.mock.calls;
    expect(first?.[0]).toBe(ID);
    expect(first?.[2]).toBe("a@example.in");
    expect(second?.[0]).not.toBe(ID);
    expect(second?.[0]).toContain(ID);
    expect(second?.[2]).toBe("b@example.in");
  });

  it.each(["email.bounced", "email.complained", "email.delivery_delayed", "email.delivered", "suppression.added", "suppression.removed"])(
    "answers non-2xx and records nothing for a verified %s with no data.to, so the missed event shows in Resend and is retried",
    async (type) => {
      const body = JSON.stringify({ type, data: {} });
      const res = await POST(req(body, signed(body)));
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(recordWebhook).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["no data at all", JSON.stringify({ type: "email.complained" })],
    ["an empty data.to", JSON.stringify({ type: "email.bounced", data: { to: [] } })],
  ])("answers non-2xx and records nothing for a verified event with %s", async (_name, body) => {
    const res = await POST(req(body, signed(body)));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(recordWebhook).not.toHaveBeenCalled();
  });

  it("logs the type of an event it could not act on, and nothing else about it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const body = JSON.stringify({ type: "email.complained", data: { from: "Trakline <updates@trakline.in>", subject: "private subject" } });
    const head = signed(body);
    await POST(req(body, head));
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain("email.complained");
    for (const secret of [head.signature, "private subject", "updates@trakline.in", head.id]) expect(logged).not.toContain(secret);
  });

  it("keeps a quiet 200 for a verified event type it does not act on, and records nothing", async () => {
    const body = JSON.stringify({ type: "domain.updated", data: { name: "trakline.in" } });
    expect((await POST(req(body, signed(body)))).status).toBe(200);
    expect(recordWebhook).not.toHaveBeenCalled();
  });

  it.each([
    ["not JSON", "not json"],
    ["a JSON value that is not an object", "[]"],
    ["an object with no type", '{"data":{"to":["a@example.in"]}}'],
  ])("answers 400 and records nothing for a signed body that is %s", async (_name, body) => {
    expect((await POST(req(body, signed(body)))).status).toBe(400);
    expect(recordWebhook).not.toHaveBeenCalled();
  });

  it.each([
    ["an AppError exactly as the store throws it", () => new AppError("SOURCE_UNAVAILABLE", `announce_webhook failed for ${EMAIL}`)],
    ["a plain Error", () => new Error(`database down for ${EMAIL}`)],
  ])("answers 500 when the store fails with %s, so Svix retries, and names nothing internal", async (_name, failure) => {
    recordWebhook.mockRejectedValueOnce(failure());
    const body = event("email.bounced");
    const res = await POST(req(body, signed(body)));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain("announce_webhook");
    expect(text).not.toContain("SOURCE_UNAVAILABLE");
  });

  it("does not mistake a foreign error for its own refusal, whatever code it carries", async () => {
    // The store cannot throw INVALID_INPUT today. The route must not depend on that: only an error
    // the route itself made goes out as it is.
    recordWebhook.mockRejectedValueOnce(new AppError("INVALID_INPUT", `announce_webhook rejected ${EMAIL}`));
    const body = event("email.bounced");
    const res = await POST(req(body, signed(body)));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toContain("announce_webhook");
    expect(text).not.toContain(EMAIL);
  });

  it("logs a fixed line when the store fails, so the two kinds of 500 can be told apart, and nothing from the event", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    recordWebhook.mockRejectedValueOnce(new AppError("SOURCE_UNAVAILABLE", `announce_webhook failed for ${EMAIL}`));
    const body = event("email.bounced");
    const head = signed(body);
    await POST(req(body, head));
    expect(error).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain("resend-webhook");
    for (const forbidden of ["@", "announce_webhook", head.signature, head.id]) expect(logged).not.toContain(forbidden);
  });

  it("gives the same ids in the same order to an identical retry, which is what makes the replay a no-op", async () => {
    const body = event("email.bounced", ["a@example.in", "b@example.in", "c@example.in"]);
    const head = signed(body);
    await POST(req(body, head));
    const first = recordWebhook.mock.calls.map(([id, , email]) => [id, email]);
    recordWebhook.mockClear();
    await POST(req(body, head));
    const second = recordWebhook.mock.calls.map(([id, , email]) => [id, email]);
    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
    expect(first.map(([id]) => id)).toEqual([ID, `${ID}#1`, `${ID}#2`]);
  });

  it("does not log an address, a signature or the body on any path", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
    recordWebhook.mockRejectedValueOnce(new Error(`database down for ${EMAIL}`));
    const body = event("email.bounced");
    const head = signed(body);
    await POST(req(body, head)); // store failure
    await POST(req(body, { ...head, signature: "v1,zzz" })); // refused
    await POST(req(body, head)); // accepted
    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    for (const secret of [EMAIL, head.signature, body, "zzz"]) expect(logged).not.toContain(secret);
  });
});
