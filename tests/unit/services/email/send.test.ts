import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// One sender for both sides of the product. The console had its own, and the traveller side cannot
// import `@/console/*` (tests/unit/console/boundary.contract.test.ts), so it moves here and the
// console delegates. `from` is the caller's, because the two sides send as different addresses.

const current = { E2E: true, RESEND_API_KEY: "re_test_key_that_is_long_enough" as string | undefined };
vi.mock("@/services/env", () => ({ env: () => current }));

import { outbox } from "@/services/email/outbox";
import { sendEmail } from "@/services/email/send";

afterEach(() => {
  outbox.clear();
  vi.unstubAllGlobals();
});

describe("sendEmail", () => {
  it("captures to the outbox under E2E, and never calls Resend", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(sendEmail({ from: "Trakline <updates@trakline.in>", to: "a@b.in", subject: "S", text: "T" })).resolves.toEqual({ outcome: "captured" });
    expect(outbox.take("a@b.in")).toHaveLength(1);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("posts to Resend with its from, and any headers, outside E2E", async () => {
    current.E2E = false;
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await sendEmail({ from: "Trakline <updates@trakline.in>", to: "a@b.in", subject: "S", text: "T", headers: { "X-Test": "1" } });
    const body = JSON.parse(String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toEqual({ from: "Trakline <updates@trakline.in>", to: ["a@b.in"], subject: "S", text: "T", headers: { "X-Test": "1" } });
    current.E2E = true;
  });

  it("never rejects: a refused or failed send is 'failed'", async () => {
    current.E2E = false;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 429 })));
    await expect(sendEmail({ from: "x <x@y.in>", to: "a@b.in", subject: "S", text: "T" })).resolves.toEqual({ outcome: "failed" });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    await expect(sendEmail({ from: "x <x@y.in>", to: "a@b.in", subject: "S", text: "T" })).resolves.toEqual({ outcome: "failed" });
    current.E2E = true;
  });

  describe("outside E2E, with Resend's reply", () => {
    const LETTER = { from: "a@trakline.in", to: "b@example.in", subject: "s", text: "t" };

    beforeEach(() => {
      current.E2E = false;
    });
    afterEach(() => {
      current.E2E = true;
    });

    it("gives back the id Resend returned, so a bounce can be tied to a recipient", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "49a3999c-0ce1" }), { status: 200 })));
      expect(await sendEmail(LETTER)).toEqual({ outcome: "sent", id: "49a3999c-0ce1" });
    });

    it("sends the idempotency key as a header when one is given", async () => {
      const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "x" }), { status: 200 }));
      vi.stubGlobal("fetch", fetcher);
      await sendEmail(LETTER, "letter:person");
      const init = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
      expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("letter:person");
    });

    it("sends no idempotency header when none is given", async () => {
      const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: "x" }), { status: 200 }));
      vi.stubGlobal("fetch", fetcher);
      await sendEmail(LETTER);
      const init = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1];
      expect(init.headers as Record<string, string>).not.toHaveProperty("Idempotency-Key");
    });

    it("is failed, with no id, when Resend refuses", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
      expect(await sendEmail(LETTER)).toEqual({ outcome: "failed" });
    });

    it("is failed when the body comes back without an id, because a send we cannot name is not a send we can track", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
      expect(await sendEmail(LETTER)).toEqual({ outcome: "failed" });
    });

    it("is failed, and does not throw, when the body is not JSON", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>", { status: 200 })));
      expect(await sendEmail(LETTER)).toEqual({ outcome: "failed" });
    });
  });
});
