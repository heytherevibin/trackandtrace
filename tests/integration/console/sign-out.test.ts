import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn(() => Promise.resolve({ error: null }));
const getClaims = vi.fn();
const serviceRpc = vi.fn(() => Promise.resolve({ data: null, error: null }));

vi.mock("@/console/auth/db", () => ({
  createConsoleDb: () => Promise.resolve({ auth: { signOut, getClaims } }),
  createConsoleServiceDb: () => ({ rpc: serviceRpc }),
  CONSOLE_COOKIE_NAME: "sb-console-auth-token",
}));

import { POST } from "@/app/console/api/sign-out/route";

function post(headers: Record<string, string> = {}): Request {
  return new Request("http://admin.localhost:4210/console/api/sign-out", {
    method: "POST",
    headers: { "sec-fetch-site": "same-origin", host: "admin.localhost:4210", ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getClaims.mockResolvedValue({ data: { claims: { sub: "u", session_id: "22222222-2222-2222-2222-222222222222" } }, error: null });
});

describe("POST /api/sign-out", () => {
  it("revokes the console session row and ends the Supabase session, locally only", async () => {
    const response = await POST(post());
    expect(response.status).toBe(200);
    expect(serviceRpc).toHaveBeenCalledWith("console_auth_revoke_session", { p_session_id: "22222222-2222-2222-2222-222222222222" });
    // Not the auth-js default ("global"): a console sign-out must never also revoke this person's
    // trakline.in sessions. The console session row above is already the authority for console
    // access, so global scope would only cost the traveller side.
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });

  it("still clears the cookie when there is no session row to revoke", async () => {
    getClaims.mockResolvedValue({ data: { claims: {} }, error: null });
    const response = await POST(post());
    expect(response.status).toBe(200);
    expect(serviceRpc).not.toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  });

  it("refuses a cross-site post", async () => {
    const response = await POST(post({ "sec-fetch-site": "cross-site" }));
    expect(response.status).toBe(403);
    expect(signOut).not.toHaveBeenCalled();
  });
});
