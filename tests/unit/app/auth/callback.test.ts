import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { FakeSupabase } from "../../../helpers/fake-supabase";

const fake = new FakeSupabase();
let configured = true;

vi.mock("@/services/supabase/server", () => ({
  createServerSupabase: async () => (configured ? fake.asDb() : null),
}));

const { GET, safeNextPath } = await import("@/app/auth/callback/route");

function get(query: string) {
  return GET(new NextRequest(`http://localhost:3000/auth/callback${query}`));
}

beforeEach(() => {
  configured = true;
  fake.auth.exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
  fake.auth.verifyOtp.mockReset().mockResolvedValue({ error: null });
});

describe("safeNextPath", () => {
  it("allows same-origin paths and rejects everything else", () => {
    expect(safeNextPath("/watchlist")).toBe("/watchlist");
    expect(safeNextPath(null)).toBe("/account");
    expect(safeNextPath("//evil.example")).toBe("/account");
    expect(safeNextPath("https://evil.example/x")).toBe("/account");
    expect(safeNextPath("watchlist")).toBe("/account");
    expect(safeNextPath("/\\evil")).toBe("/account");
  });
});

describe("GET /auth/callback", () => {
  it("exchanges an OAuth code and redirects to next", async () => {
    const res = await get("?code=abc&next=/watchlist");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3000/watchlist");
    expect(fake.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });
  it("verifies a magic-link token hash", async () => {
    const res = await get("?token_hash=t1&type=magiclink");
    expect(res.headers.get("location")).toBe("http://localhost:3000/account");
    expect(fake.auth.verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "t1" });
  });
  it("redirects to the login error state without params", async () => {
    const res = await get("");
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?error=link");
  });
  it("redirects to the login error state when the exchange fails", async () => {
    fake.auth.exchangeCodeForSession.mockResolvedValueOnce({ error: { message: "bad" } });
    const res = await get("?code=abc");
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?error=link");
  });
  it("reports accounts unavailable when Supabase is not configured", async () => {
    configured = false;
    const res = await get("?code=abc");
    expect(res.headers.get("location")).toBe("http://localhost:3000/login?error=unavailable");
  });
});
