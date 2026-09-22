import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleRole } from "@/console/auth/member";
import { acceptInviteUrl, sendInviteLetter } from "@/console/email/invite";
import { outbox } from "@/console/email/outbox";
import { sendConsoleEmail } from "@/console/email/send";
import { consoleMessages } from "@/console/messages";
import { resetEnvCache } from "@/services/env";

// Same partial-mock shape as email/send.test.ts: sendConsoleEmail is a spy that calls straight
// through to the real implementation (still driven by vi.stubEnv/the outbox) for every test but
// the two that override it for a single call -- proving sendInviteLetter's own try/catch, not just
// sendConsoleEmail's documented "never rejects" contract, is what keeps a send failure from
// reaching the caller.
vi.mock("@/console/email/send", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/console/email/send")>();
  return { ...actual, sendConsoleEmail: vi.fn(actual.sendConsoleEmail) };
});

const ROLES = ["owner", "admin", "support", "viewer"] as const satisfies readonly ConsoleRole[];

const ARGS = {
  to: "kiran@example.com",
  // Says what it is rather than imitating one. A real invite token is
  // `encode(gen_random_bytes(32), 'hex')` -- 64 hex characters -- and a fixture wearing that exact
  // shape is indistinguishable from a leaked one to a secret scanner, which is what GitGuardian
  // called on PR #28. Nothing here needs the real shape: the two url tests use "abc" and "a b&c",
  // and this value only has to appear in the link and nowhere else in the body (see below), which a
  // distinctive placeholder does better than hex a body could plausibly contain by accident.
  token: "invite-token-fixture-not-a-real-secret",
  role: "support" as ConsoleRole,
  invitedBy: "Asha Rao",
  origin: "https://admin.trakline.in",
};

beforeEach(() => {
  outbox.clear();
  vi.stubEnv("E2E", "1");
  resetEnvCache();
  vi.mocked(sendConsoleEmail).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe("acceptInviteUrl", () => {
  it("lands on /setup with the token as a query param -- the page the first-Owner link already uses", () => {
    expect(acceptInviteUrl("http://admin.localhost:4210", "abc")).toBe("http://admin.localhost:4210/setup?token=abc");
    expect(acceptInviteUrl("https://admin.trakline.in", "abc")).toBe("https://admin.trakline.in/setup?token=abc");
  });

  it("escapes a token rather than pasting it in raw", () => {
    expect(acceptInviteUrl("https://admin.trakline.in", "a b&c")).toBe("https://admin.trakline.in/setup?token=a%20b%26c");
  });
});

describe("sendInviteLetter", () => {
  it("sends to the invited address", async () => {
    await sendInviteLetter(ARGS);
    const [letter] = outbox.take();
    expect(letter?.to).toBe(ARGS.to);
  });

  it("has a fixed, recognisable subject", async () => {
    await sendInviteLetter(ARGS);
    const [letter] = outbox.take();
    expect(letter?.subject).toBe("You're invited to the Trakline console");
  });

  it("names who sent the invite", async () => {
    await sendInviteLetter(ARGS);
    const [letter] = outbox.take();
    expect(letter?.text).toContain(ARGS.invitedBy);
  });

  it("carries a link built from the given origin", async () => {
    await sendInviteLetter(ARGS);
    const [letter] = outbox.take();
    expect(letter?.text).toContain(acceptInviteUrl(ARGS.origin, ARGS.token));
  });

  it.each(ROLES)("names the %s role in the member's own words, from consoleMessages.frame.roleLabel", async (role) => {
    await sendInviteLetter({ ...ARGS, role });
    const [letter] = outbox.take();
    expect(letter?.text).toContain(consoleMessages.frame.roleLabel[role]);
  });

  it("never the database's lowercase enum value on its own", async () => {
    await sendInviteLetter({ ...ARGS, role: "support" });
    const [letter] = outbox.take();
    // consoleMessages.frame.roleLabel.support is "Support" -- this checks the bare lowercase form
    // (the enum value console_invite_member would otherwise leak) is not what actually appears.
    expect(letter?.text ?? "").not.toMatch(/\bsupport\b/);
  });

  it("the token appears in the link and nowhere else in the body", async () => {
    await sendInviteLetter(ARGS);
    const [letter] = outbox.take();
    const text = letter?.text ?? "";
    const link = acceptInviteUrl(ARGS.origin, ARGS.token);
    expect(text).toContain(link);
    // Exactly one occurrence of the link (split on it yields exactly two pieces), and no leftover
    // occurrence of the bare token once that one link is removed -- no heading, no fallback line.
    expect(text.split(link)).toHaveLength(2);
    expect(text.replaceAll(link, "")).not.toContain(ARGS.token);
  });

  it("sends nothing at all when the origin is empty, rather than assembling a link from unchecked input", async () => {
    await sendInviteLetter({ ...ARGS, origin: "" });
    expect(sendConsoleEmail).not.toHaveBeenCalled();
    expect(outbox.take()).toEqual([]);
  });

  it("resolves without throwing even when the send itself rejects", async () => {
    vi.mocked(sendConsoleEmail).mockImplementationOnce(() => Promise.reject(new Error("boom")));
    await expect(sendInviteLetter(ARGS)).resolves.toBeUndefined();
  });

  it("resolves without throwing when sendConsoleEmail reports a failure", async () => {
    vi.mocked(sendConsoleEmail).mockImplementationOnce(() => Promise.resolve("failed"));
    await expect(sendInviteLetter(ARGS)).resolves.toBeUndefined();
  });
});
