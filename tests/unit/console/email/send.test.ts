import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { outbox } from "@/console/email/outbox";
import { sendConsoleEmail } from "@/console/email/send";
import { env, resetEnvCache } from "@/services/env";

// `env` becomes a spy that calls straight through to the real implementation, so every test below
// keeps behaving exactly as it did against the unmocked module (env() still driven by vi.stubEnv).
// Only "reports a failure rather than throwing when the environment itself cannot be read" overrides
// it, for a single call, to prove sendConsoleEmail catches a throw from env() and not only from fetch.
vi.mock("@/services/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/env")>();
  return { ...actual, env: vi.fn(actual.env) };
});

const letter = { to: "asha@trakline.in", subject: "Your Trakline console sign-in link", text: "Open this once: https://admin.trakline.in/auth/confirm?token_hash=x&type=magiclink" };

beforeEach(() => {
  outbox.clear();
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvCache();
});

describe("sendConsoleEmail", () => {
  it("captures instead of sending under E2E, and never calls Resend", async () => {
    vi.stubEnv("E2E", "1");
    vi.stubEnv("RESEND_API_KEY", "re_aaaaaaaaaaaaaaaaaaaaaaaa");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    resetEnvCache();

    await expect(sendConsoleEmail(letter)).resolves.toBe("captured");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(outbox.take()).toEqual([letter]);
  });

  it("posts to Resend with the configured sender", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_aaaaaaaaaaaaaaaaaaaaaaaa");
    // Typed, not inferred: a bare `vi.fn(() => …)` infers a zero-argument signature, so reading
    // `.mock.calls[0]` below is an index into a zero-length tuple and `tsc --noEmit` refuses it
    // (TS2493) even though vitest runs it happily. This is the repo's convention wherever a test
    // reads the arguments a mock was called with.
    const fetchSpy = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(() => Promise.resolve(new Response('{"id":"1"}', { status: 200 })));
    vi.stubGlobal("fetch", fetchSpy);
    resetEnvCache();

    await expect(sendConsoleEmail(letter)).resolves.toBe("sent");
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(String(init.body))).toEqual({
      from: "Trakline Console <console@trakline.in>",
      to: [letter.to],
      subject: letter.subject,
      text: letter.text,
    });
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_aaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("reports a failure rather than throwing, so sign-in answers the same either way", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_aaaaaaaaaaaaaaaaaaaaaaaa");
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("nope", { status: 500 }))));
    resetEnvCache();
    await expect(sendConsoleEmail(letter)).resolves.toBe("failed");
  });

  it("reports a failure when fetch itself rejects, spec §5's literal DNS/TLS/timeout case", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_aaaaaaaaaaaaaaaaaaaaaaaa");
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network unreachable"))));
    resetEnvCache();
    await expect(sendConsoleEmail(letter)).resolves.toBe("failed");
  });

  it("reports a failure rather than throwing when the environment itself cannot be read", async () => {
    vi.mocked(env).mockImplementationOnce(() => {
      throw new Error("Invalid environment: DATA_KEY: missing DATA_KEY.");
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await expect(sendConsoleEmail(letter)).resolves.toBe("failed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports a failure when a send is not configured at all", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    resetEnvCache();
    await expect(sendConsoleEmail(letter)).resolves.toBe("failed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
