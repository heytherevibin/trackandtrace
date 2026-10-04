import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { outbox } from "@/console/email/outbox";
import { sendConsoleEmail } from "@/console/email/send";
import { env, resetEnvCache } from "@/services/env";
import { MemoryKv } from "@/services/kv";

// Suppression is read from the database before every send; nothing here is suppressed, and the
// wrapper's own refusals are pinned in tests/unit/services/email/suppression.test.ts.
const { suppressionFor } = vi.hoisted(() => ({ suppressionFor: vi.fn(async (_email: string) => null as "all" | "list" | null) }));
vi.mock("@/services/announcements/store", () => ({ suppressionFor }));

// The store console mail is counted against. A real one talks to Upstash; this one is read back
// below to prove a console letter takes from the same daily allowance a sign-up confirmation does.
const counter = new MemoryKv();
vi.mock("@/services/shared-store", () => ({ publicStoreForReading: () => ({ kv: counter, prefix: "tt:test" }) }));

// `env` becomes a spy that calls straight through to the real implementation, so every test below
// keeps behaving exactly as it did against the unmocked module (env() still driven by vi.stubEnv).
// Only "reports a failure rather than throwing when the environment itself cannot be read" overrides
// it, for a single call, to prove sendConsoleEmail catches a throw from env() and not only from fetch.
vi.mock("@/services/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/env")>();
  return { ...actual, env: vi.fn(actual.env) };
});

const letter = { to: "asha@trakline.in", subject: "Your Trakline console sign-in link", text: "Open this once: https://admin.trakline.in/auth/confirm?token_hash=x&type=magiclink" };

beforeEach(async () => {
  suppressionFor.mockReset();
  suppressionFor.mockResolvedValue(null);
  outbox.clear();
  // The counter is one module-scope store shared by every test here, so a count left by the test
  // before would be read as this one's.
  await counter.del("tt:test:email:2026-09-28");
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetEnvCache();
});

describe("sendConsoleEmail", () => {
  it("reports a hard-bounced address as failed, sends nothing and counts nothing", async () => {
    vi.stubEnv("E2E", "1");
    resetEnvCache();
    suppressionFor.mockResolvedValue("all");

    await expect(sendConsoleEmail(letter)).resolves.toBe("failed");
    expect(outbox.take()).toEqual([]);
  });

  it("captures instead of sending under E2E, and never calls Resend", async () => {
    vi.stubEnv("E2E", "1");
    vi.stubEnv("RESEND_API_KEY", "re_aaaaaaaaaaaaaaaaaaaaaaaa");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    resetEnvCache();

    await expect(sendConsoleEmail(letter)).resolves.toBe("captured");
    expect(fetchSpy).not.toHaveBeenCalled();
    // The captured letter carries the From the console sends as. It gained that field when the
    // sender moved to `@/services/email/send`, shared with the traveller side, which sends as a
    // different address — so a run reading one outbox can tell the two apart.
    expect(outbox.take()).toEqual([{ ...letter, from: env().CONSOLE_EMAIL_FROM }]);
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

  it("counts a sent letter against the day's email allowance, on Resend's UTC day", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_aaaaaaaaaaaaaaaaaaaaaaaa");
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response('{"id":"1"}', { status: 200 }))));
    vi.setSystemTime(new Date("2026-09-28T20:00:00Z")); // 01:30 IST on the 29th, still the 28th for Resend
    resetEnvCache();

    await expect(sendConsoleEmail(letter)).resolves.toBe("sent");
    expect(await counter.get("tt:test:email:2026-09-28")).toBe("1");
    vi.useRealTimers();
  });

  it("does not count a letter that never reached Resend", async () => {
    vi.stubEnv("E2E", "1");
    vi.stubGlobal("fetch", vi.fn());
    vi.setSystemTime(new Date("2026-09-28T20:00:00Z"));
    resetEnvCache();

    await expect(sendConsoleEmail(letter)).resolves.toBe("captured");
    expect(await counter.get("tt:test:email:2026-09-28")).toBeNull();
    vi.useRealTimers();
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
