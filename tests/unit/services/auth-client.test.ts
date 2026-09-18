// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const supabase = vi.hoisted(() => ({
  auth: {
    signInWithPasskey: vi.fn(),
    registerPasskey: vi.fn(),
    passkey: { list: vi.fn(), delete: vi.fn() },
  },
}));
const client = vi.hoisted(() => ({ value: supabase as typeof supabase | null }));
vi.mock("@/services/supabase/browser", () => ({ createBrowserSupabase: () => client.value }));

const auth = await import("@/services/auth-client");

const webAuthnError = (code: string) => Object.assign(new Error("ceremony"), { code, __isWebAuthnError: true });

describe("passkeys", () => {
  beforeEach(() => {
    client.value = supabase;
    for (const fn of [supabase.auth.signInWithPasskey, supabase.auth.registerPasskey, supabase.auth.passkey.list, supabase.auth.passkey.delete]) fn.mockReset();
    vi.stubGlobal("PublicKeyCredential", function PublicKeyCredential() {});
  });

  it("reports the browser's own support, so no passkey route is offered where it cannot work", () => {
    expect(auth.passkeysUsable()).toBe(true);
    vi.stubGlobal("PublicKeyCredential", undefined);
    expect(auth.passkeysUsable()).toBe(false);
  });

  it("signs in with a passkey", async () => {
    supabase.auth.signInWithPasskey.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    await expect(auth.signInWithPasskey()).resolves.toEqual({ ok: true });
    expect(supabase.auth.signInWithPasskey).toHaveBeenCalledTimes(1);
  });

  it("says nothing when the reader dismisses the device prompt", async () => {
    supabase.auth.signInWithPasskey.mockResolvedValue({ data: null, error: webAuthnError("ERROR_CEREMONY_ABORTED") });
    await expect(auth.signInWithPasskey()).resolves.toEqual({ ok: false, message: null });
  });

  it("passes a refusal through as a message", async () => {
    supabase.auth.signInWithPasskey.mockResolvedValue({ data: null, error: Object.assign(new Error("No passkey found"), { name: "AuthApiError" }) });
    await expect(auth.signInWithPasskey()).resolves.toEqual({ ok: false, message: "No passkey found" });
  });

  it("registers a passkey for the signed-in reader, and names a device that already has one", async () => {
    supabase.auth.registerPasskey.mockResolvedValue({ data: { id: "p1" }, error: null });
    await expect(auth.registerPasskey()).resolves.toEqual({ ok: true });
    supabase.auth.registerPasskey.mockResolvedValue({ data: null, error: webAuthnError("ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") });
    await expect(auth.registerPasskey()).resolves.toEqual({ ok: false, message: "This device already has a passkey for your account." });
  });

  it("lists and removes passkeys", async () => {
    supabase.auth.passkey.list.mockResolvedValue({ data: [{ id: "p1", friendly_name: "iPhone", created_at: "2026-09-17T06:30:00.000Z", last_used_at: "2026-09-17T07:00:00.000Z" }], error: null });
    await expect(auth.listPasskeys()).resolves.toEqual([{ id: "p1", name: "iPhone", createdAt: "2026-09-17T06:30:00.000Z", lastUsedAt: "2026-09-17T07:00:00.000Z" }]);
    supabase.auth.passkey.list.mockResolvedValue({ data: null, error: new Error("nope") });
    await expect(auth.listPasskeys()).resolves.toEqual([]);

    supabase.auth.passkey.delete.mockResolvedValue({ error: null });
    await expect(auth.deletePasskey("p1")).resolves.toEqual({ ok: true });
    expect(supabase.auth.passkey.delete).toHaveBeenCalledWith({ passkeyId: "p1" });
  });

  it("answers honestly when accounts are not configured on this deployment", async () => {
    client.value = null;
    await expect(auth.signInWithPasskey()).resolves.toEqual({ ok: false, message: "Sign-in is not connected on this deployment." });
    await expect(auth.listPasskeys()).resolves.toEqual([]);
  });
});
