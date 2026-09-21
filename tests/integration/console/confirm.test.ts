import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const getClaims = vi.fn();
const signOut = vi.fn();
const memberDb = { auth: { verifyOtp, getClaims, signOut } };
const serviceRpc = vi.fn();

vi.mock("@/console/auth/db", () => ({
  createConsoleDb: () => Promise.resolve(memberDb),
  createConsoleServiceDb: () => ({ rpc: serviceRpc }),
  CONSOLE_COOKIE_NAME: "sb-console-auth-token",
}));

import { GET } from "@/app/console/auth/confirm/route";

const MEMBER = { user_id: "11111111-1111-1111-1111-111111111111", email: "asha@trakline.in", name: "Asha Rao", role: "owner", status: "setup", key_count: 0 };

function request(query: string): Request {
  return new Request(`http://admin.localhost:4210/console/auth/confirm${query}`, { headers: { host: "admin.localhost:4210" } });
}

beforeEach(() => {
  verifyOtp.mockReset().mockResolvedValue({ data: { user: { email: "asha@trakline.in" } }, error: null });
  getClaims.mockReset().mockResolvedValue({
    data: { claims: { sub: "11111111-1111-1111-1111-111111111111", session_id: "22222222-2222-2222-2222-222222222222" } },
    error: null,
  });
  signOut.mockReset().mockResolvedValue({ error: null });
  serviceRpc.mockReset().mockImplementation((name: string) => Promise.resolve({ data: name === "console_auth_member_by_email" ? MEMBER : null, error: null }));
});

describe("GET /auth/confirm", () => {
  it("verifies the token and opens a session keyed by the JWT's session id", async () => {
    const response = await GET(request("?token_hash=abc&type=magiclink"));
    expect(verifyOtp).toHaveBeenCalledWith({ type: "magiclink", token_hash: "abc" });
    expect(serviceRpc).toHaveBeenCalledWith("console_auth_start_session", expect.objectContaining({ p_session_id: "22222222-2222-2222-2222-222222222222" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/setup");
    // The confirmation completed, so the cookie verifyOtp just wrote must survive: the whole point
    // of console.sessions is to be the thing that answers `console_me` from here on.
    expect(signOut).not.toHaveBeenCalled();
  });

  it("sends a member who already holds two keys to the sign-in key step", async () => {
    serviceRpc.mockImplementation((name: string) =>
      Promise.resolve({ data: name === "console_auth_member_by_email" ? { ...MEMBER, status: "active", key_count: 2 } : null, error: null }),
    );
    const response = await GET(request("?token_hash=abc&type=magiclink"));
    expect(response.headers.get("location")).toContain("/sign-in-key");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("sends a bad link back to sign-in without opening anything", async () => {
    verifyOtp.mockResolvedValue({ data: null, error: { message: "Token has expired" } });
    const response = await GET(request("?token_hash=abc&type=magiclink"));
    expect(response.headers.get("location")).toContain("/login?error=link");
    expect(serviceRpc).not.toHaveBeenCalledWith("console_auth_start_session", expect.anything());
    // verifyOtp itself failed here -- no cookie was ever written, so there is nothing to sign out.
    expect(signOut).not.toHaveBeenCalled();
  });

  it("refuses a verified link whose address is not a member's, and ends the Supabase session", async () => {
    serviceRpc.mockImplementation((name: string) => Promise.resolve({ data: name === "console_auth_member_by_email" ? null : null, error: null }));
    const response = await GET(request("?token_hash=abc&type=magiclink"));
    expect(response.headers.get("location")).toContain("/login?error=link");
    expect(serviceRpc).not.toHaveBeenCalledWith("console_auth_start_session", expect.anything());
    // verifyOtp had already succeeded and written a cookie by this point: refusing the member must
    // sign that cookie back out, or the browser is left holding a session while being told sign-in
    // failed.
    expect(signOut).toHaveBeenCalled();
  });

  it("refuses a claims set with no session id", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "11111111-1111-1111-1111-111111111111" } }, error: null });
    const response = await GET(request("?token_hash=abc&type=magiclink"));
    expect(response.headers.get("location")).toContain("/login?error=link");
    // Same as above: verifyOtp already succeeded, so the cookie it wrote must be signed back out.
    expect(signOut).toHaveBeenCalled();
  });

  it("refuses anything but a magic link", async () => {
    const response = await GET(request("?token_hash=abc&type=recovery"));
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("/login?error=link");
    expect(signOut).not.toHaveBeenCalled();
  });
});
