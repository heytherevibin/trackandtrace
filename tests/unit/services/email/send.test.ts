import { afterEach, describe, expect, it, vi } from "vitest";

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
    await expect(sendEmail({ from: "Trakline <updates@trakline.in>", to: "a@b.in", subject: "S", text: "T" })).resolves.toBe("captured");
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
    await expect(sendEmail({ from: "x <x@y.in>", to: "a@b.in", subject: "S", text: "T" })).resolves.toBe("failed");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("down"))));
    await expect(sendEmail({ from: "x <x@y.in>", to: "a@b.in", subject: "S", text: "T" })).resolves.toBe("failed");
    current.E2E = true;
  });
});
