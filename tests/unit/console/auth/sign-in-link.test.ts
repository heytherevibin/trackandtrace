import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsoleDb } from "@/console/auth/db";
import { confirmUrl, sendSignInLink } from "@/console/auth/sign-in-link";
import { outbox } from "@/console/email/outbox";
import { resetEnvCache } from "@/services/env";

const MEMBER = { user_id: "11111111-1111-1111-1111-111111111111", email: "asha@trakline.in", name: "Asha Rao", role: "owner", status: "active", key_count: 2 };

function fakeDb(opts: { member?: unknown; hashedToken?: string; linkError?: boolean } = {}) {
  const generateLink = vi.fn(() =>
    Promise.resolve(
      opts.linkError
        ? { data: null, error: { message: "over_email_send_rate_limit" } }
        : { data: { properties: { hashed_token: opts.hashedToken ?? "hashed-token-value", action_link: "https://supabase.example/auth/v1/verify?x=1" } }, error: null },
    ),
  );
  const rpc = vi.fn(() => Promise.resolve({ data: opts.member ?? null, error: null }));
  return { db: { rpc, auth: { admin: { generateLink } } } as unknown as ConsoleDb, rpc, generateLink };
}

beforeEach(() => {
  outbox.clear();
  vi.stubEnv("E2E", "1");
  resetEnvCache();
});

describe("confirmUrl", () => {
  it("points at the console's own confirm address, on the host that asked", () => {
    expect(confirmUrl("admin.localhost:4210", "abc")).toBe("http://admin.localhost:4210/auth/confirm?token_hash=abc&type=magiclink");
    expect(confirmUrl("admin.trakline.in", "abc")).toBe("https://admin.trakline.in/auth/confirm?token_hash=abc&type=magiclink");
  });

  it("escapes a token rather than pasting it in raw", () => {
    expect(confirmUrl("admin.trakline.in", "a b&c")).toContain("token_hash=a%20b%26c");
  });
});

describe("sendSignInLink", () => {
  it("sends nothing at all for an address that is not a member", async () => {
    const { db, generateLink } = fakeDb({ member: null });
    await sendSignInLink("stranger@example.com", "admin.trakline.in", db);
    expect(generateLink).not.toHaveBeenCalled();
    expect(outbox.take()).toEqual([]);
  });

  it("sends nothing for a member who is still removed", async () => {
    const { db, generateLink } = fakeDb({ member: { ...MEMBER, status: "removed" } });
    await sendSignInLink("asha@trakline.in", "admin.trakline.in", db);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("mints a magic link for a member and mails our own confirm address", async () => {
    const { db, generateLink } = fakeDb({ member: MEMBER });
    await sendSignInLink("asha@trakline.in", "admin.trakline.in", db);
    expect(generateLink).toHaveBeenCalledWith(expect.objectContaining({ type: "magiclink", email: "asha@trakline.in" }));
    const [letter] = outbox.take();
    expect(letter?.to).toBe("asha@trakline.in");
    expect(letter?.subject).toBe("Your Trakline console sign-in link");
    expect(letter?.text).toContain("https://admin.trakline.in/auth/confirm?token_hash=hashed-token-value&type=magiclink");
  });

  it("never puts Supabase's own action_link in the letter", async () => {
    const { db } = fakeDb({ member: MEMBER });
    await sendSignInLink("asha@trakline.in", "admin.trakline.in", db);
    expect(outbox.take()[0]?.text).not.toContain("/auth/v1/verify");
  });

  it("swallows a refused mint rather than letting it reach the caller", async () => {
    const { db } = fakeDb({ member: MEMBER, linkError: true });
    await expect(sendSignInLink("asha@trakline.in", "admin.trakline.in", db)).resolves.toBeUndefined();
    expect(outbox.take()).toEqual([]);
  });
});
